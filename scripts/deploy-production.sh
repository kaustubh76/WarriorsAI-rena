#!/bin/bash
################################################################################
# Production Deployment Script
#
# Automated deployment script for Warriors AI Flow implementation
#
# Usage:
#   ./scripts/deploy-production.sh [options]
#
# Options:
#   --skip-deps       Skip dependency installation
#   --skip-build      Skip application build
#   --skip-migrate    Skip database migrations
#   --dry-run         Show what would be done without executing
#
# Requirements:
#   - Node.js v18+
#   - PostgreSQL 14+
#   - Systemd
#   - Nginx (optional)
################################################################################

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ENV_FILE="${ENV_FILE:-/etc/WarriorsAI/env}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Options
SKIP_DEPS=false
SKIP_BUILD=false
SKIP_MIGRATE=false
DRY_RUN=false

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo -e "\n${CYAN}${BOLD}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

execute_command() {
    local cmd="$1"
    local desc="$2"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Would execute: $cmd"
        return 0
    fi

    echo -e "${BLUE}Running:${NC} $desc"
    if eval "$cmd"; then
        print_success "$desc completed"
        return 0
    else
        print_error "$desc failed"
        return 1
    fi
}

check_requirements() {
    local missing_deps=()

    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_deps+=("Node.js (v18+)")
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 18 ]; then
            missing_deps+=("Node.js v18+ (current: v$node_version)")
        fi
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi

    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        missing_deps+=("PostgreSQL")
    fi

    # Check systemd
    if ! command -v systemctl &> /dev/null; then
        missing_deps+=("systemd")
    fi

    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        return 1
    fi

    print_success "All requirements satisfied"
    return 0
}

check_environment() {
    print_section "Checking environment configuration"

    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file not found: $ENV_FILE"
        print_info "Create it with: sudo mkdir -p /etc/WarriorsAI && sudo touch $ENV_FILE"
        return 1
    fi

    # Load environment
    export $(grep -v '^#' "$ENV_FILE" | xargs)

    # Check required variables
    local required_vars=(
        "DATABASE_URL"
        "NEXT_PUBLIC_CHAIN_ID"
        "EXTERNAL_MARKET_MIRROR_ADDRESS"
        "PRIVATE_KEY"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        return 1
    fi

    print_success "Environment configuration valid"
    return 0
}

backup_current_deployment() {
    print_section "Creating backup of current deployment"

    local backup_dir="/var/backups/warriors"
    local timestamp=$(date +%Y%m%d_%H%M%S)

    execute_command \
        "sudo mkdir -p $backup_dir" \
        "Create backup directory"

    # Backup application
    if [ -d "$FRONTEND_DIR/.next" ]; then
        execute_command \
            "sudo tar -czf $backup_dir/warriors_app_$timestamp.tar.gz -C $PROJECT_ROOT --exclude=node_modules --exclude=.next/cache ." \
            "Backup application files"
    fi

    # Backup database
    if [ -n "$DATABASE_URL" ]; then
        execute_command \
            "pg_dump $DATABASE_URL | gzip > $backup_dir/warriors_db_$timestamp.sql.gz" \
            "Backup database"
    fi

    print_success "Backup completed: $backup_dir/*_$timestamp.*"
}

install_dependencies() {
    if [ "$SKIP_DEPS" = true ]; then
        print_warning "Skipping dependency installation"
        return 0
    fi

    print_section "Installing dependencies"

    cd "$FRONTEND_DIR"

    execute_command \
        "npm ci --production=false" \
        "Install Node.js dependencies"
}

run_database_migrations() {
    if [ "$SKIP_MIGRATE" = true ]; then
        print_warning "Skipping database migrations"
        return 0
    fi

    print_section "Running database migrations"

    cd "$FRONTEND_DIR"

    # Check database connection
    execute_command \
        "npx prisma db execute --stdin <<< 'SELECT 1' > /dev/null 2>&1" \
        "Test database connection"

    # Run migrations
    execute_command \
        "npx prisma migrate deploy" \
        "Apply database migrations"

    # Generate Prisma client
    execute_command \
        "npx prisma generate" \
        "Generate Prisma client"
}

build_application() {
    if [ "$SKIP_BUILD" = true ]; then
        print_warning "Skipping application build"
        return 0
    fi

    print_section "Building application"

    cd "$FRONTEND_DIR"

    # Build Next.js
    execute_command \
        "npm run build" \
        "Build Next.js application"

    # Compile TypeScript services
    execute_command \
        "npx tsc services/eventListener.ts --outDir dist/services --esModuleInterop --resolveJsonModule --skipLibCheck" \
        "Compile event listener service"
}

setup_systemd_services() {
    print_section "Setting up systemd services"

    # Copy service files
    if [ -f "$PROJECT_ROOT/deployment/warriors-app.service" ]; then
        execute_command \
            "sudo cp $PROJECT_ROOT/deployment/warriors-app.service /etc/systemd/system/" \
            "Install warriors-app service"
    fi

    if [ -f "$PROJECT_ROOT/deployment/flow-event-listener.service" ]; then
        execute_command \
            "sudo cp $PROJECT_ROOT/deployment/flow-event-listener.service /etc/systemd/system/" \
            "Install flow-event-listener service"
    fi

    # Reload systemd
    execute_command \
        "sudo systemctl daemon-reload" \
        "Reload systemd daemon"

    # Enable services
    execute_command \
        "sudo systemctl enable warriors-app" \
        "Enable warriors-app service"

    execute_command \
        "sudo systemctl enable flow-event-listener" \
        "Enable flow-event-listener service"
}

restart_services() {
    print_section "Restarting services"

    # Stop services
    execute_command \
        "sudo systemctl stop warriors-app || true" \
        "Stop warriors-app"

    execute_command \
        "sudo systemctl stop flow-event-listener || true" \
        "Stop flow-event-listener"

    # Wait a moment
    sleep 2

    # Start services
    execute_command \
        "sudo systemctl start warriors-app" \
        "Start warriors-app"

    execute_command \
        "sudo systemctl start flow-event-listener" \
        "Start flow-event-listener"

    # Check status
    sleep 3

    if sudo systemctl is-active --quiet warriors-app; then
        print_success "warriors-app is running"
    else
        print_error "warriors-app failed to start"
        print_info "Check logs: sudo journalctl -u warriors-app -n 50"
        return 1
    fi

    if sudo systemctl is-active --quiet flow-event-listener; then
        print_success "flow-event-listener is running"
    else
        print_error "flow-event-listener failed to start"
        print_info "Check logs: sudo journalctl -u flow-event-listener -n 50"
        return 1
    fi
}

run_health_checks() {
    print_section "Running health checks"

    # Wait for services to be fully ready
    sleep 5

    # Check application health
    local health_endpoint="http://localhost:3000/api/health"
    if curl -f -s "$health_endpoint" > /dev/null 2>&1; then
        print_success "Application health check passed"
    else
        print_error "Application health check failed"
        print_info "URL: $health_endpoint"
        return 1
    fi

    # Check RPC health
    local rpc_health_endpoint="http://localhost:3000/api/rpc/health"
    if curl -f -s "$rpc_health_endpoint" > /dev/null 2>&1; then
        print_success "RPC health check passed"
    else
        print_warning "RPC health check failed (may recover)"
        print_info "URL: $rpc_health_endpoint"
    fi

    # Check event listener status
    local events_status_endpoint="http://localhost:3000/api/events/status"
    if curl -f -s "$events_status_endpoint" > /dev/null 2>&1; then
        print_success "Event listener status check passed"
    else
        print_warning "Event listener status check failed (may still be starting)"
        print_info "URL: $events_status_endpoint"
    fi

    # Check database health
    if [ -f "$SCRIPT_DIR/check-database-health.ts" ]; then
        cd "$PROJECT_ROOT"
        if npx ts-node scripts/check-database-health.ts --quiet; then
            print_success "Database health check passed"
        else
            print_warning "Database health check had warnings"
        fi
    fi
}

print_deployment_summary() {
    print_header "Deployment Summary"

    echo -e "\n${BOLD}Services Status:${NC}"
    sudo systemctl status warriors-app --no-pager | grep "Active:" || true
    sudo systemctl status flow-event-listener --no-pager | grep "Active:" || true

    echo -e "\n${BOLD}API Endpoints:${NC}"
    echo "  Health:         http://localhost:3000/api/health"
    echo "  RPC Health:     http://localhost:3000/api/rpc/health"
    echo "  Event Status:   http://localhost:3000/api/events/status"
    echo "  Metrics:        http://localhost:3000/api/metrics"

    echo -e "\n${BOLD}Logs:${NC}"
    echo "  App:            sudo journalctl -u warriors-app -f"
    echo "  Event Listener: sudo journalctl -u flow-event-listener -f"

    echo -e "\n${BOLD}Monitoring:${NC}"
    echo "  Dashboard:      $SCRIPT_DIR/monitor-flow-system.sh"
    echo "  DB Health:      npx ts-node $SCRIPT_DIR/check-database-health.ts"

    echo -e "\n${BOLD}Management:${NC}"
    echo "  Restart:        sudo systemctl restart warriors-app flow-event-listener"
    echo "  Stop:           sudo systemctl stop warriors-app flow-event-listener"
    echo "  Status:         sudo systemctl status warriors-app flow-event-listener"

    echo ""
    print_success "Deployment completed successfully!"
    echo ""
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    print_header "🚀 Warriors AI Production Deployment"

    echo -e "${BOLD}Project:${NC} Warriors AI Flow Implementation"
    echo -e "${BOLD}Date:${NC}    $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${BOLD}User:${NC}    $(whoami)"
    echo -e "${BOLD}Dir:${NC}     $PROJECT_ROOT"

    if [ "$DRY_RUN" = true ]; then
        print_warning "Running in DRY RUN mode - no changes will be made"
    fi

    echo ""

    # Step 1: Check requirements
    print_section "Step 1: Checking requirements"
    if ! check_requirements; then
        print_error "Deployment aborted: Missing requirements"
        exit 1
    fi

    # Step 2: Check environment
    print_section "Step 2: Checking environment"
    if ! check_environment; then
        print_error "Deployment aborted: Invalid environment configuration"
        exit 1
    fi

    # Step 3: Backup current deployment
    print_section "Step 3: Creating backup"
    backup_current_deployment

    # Step 4: Install dependencies
    print_section "Step 4: Installing dependencies"
    install_dependencies

    # Step 5: Run database migrations
    print_section "Step 5: Running database migrations"
    run_database_migrations

    # Step 6: Build application
    print_section "Step 6: Building application"
    build_application

    # Step 7: Setup systemd services
    print_section "Step 7: Setting up services"
    setup_systemd_services

    # Step 8: Restart services
    print_section "Step 8: Restarting services"
    restart_services

    # Step 9: Run health checks
    print_section "Step 9: Running health checks"
    run_health_checks

    # Step 10: Print summary
    print_deployment_summary
}

################################################################################
# Parse Arguments
################################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-migrate)
            SKIP_MIGRATE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-deps       Skip dependency installation"
            echo "  --skip-build      Skip application build"
            echo "  --skip-migrate    Skip database migrations"
            echo "  --dry-run         Show what would be done without executing"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

################################################################################
# Run Deployment
################################################################################

main

exit 0
