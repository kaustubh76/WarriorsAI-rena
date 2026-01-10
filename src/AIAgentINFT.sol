// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "../lib/openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {ERC721Enumerable} from "../lib/openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "../lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol";

import {IERC7857, IERC7857_INTERFACE_ID} from "./interfaces/IERC7857.sol";
import {IAgentINFTOracle} from "./interfaces/IAgentINFTOracle.sol";

/**
 * @title AIAgentINFT
 * @author Warriors AI Arena
 * @notice ERC-7857 compliant iNFT contract for AI trading agents
 * @dev Implements intelligent NFTs with encrypted metadata, secure transfers,
 *      and authorization-based access control for AI agents.
 *
 * Key Features:
 * - ERC-721 + ERC-7857 compliance
 * - Encrypted metadata storage via 0G Storage
 * - Secure re-encryption during transfers
 * - Authorization system for copy trading
 * - Staking with automatic tier calculation
 * - Stakes transfer with NFT ownership
 * - AIverse marketplace compatibility
 */
contract AIAgentINFT is ERC721Enumerable, Ownable, ReentrancyGuard {
    // ============ Errors ============
    error AIAgentINFT__NotOwner();
    error AIAgentINFT__NotAuthorized();
    error AIAgentINFT__InvalidProof();
    error AIAgentINFT__InvalidMetadataHash();
    error AIAgentINFT__InvalidEncryptedMetadataRef();
    error AIAgentINFT__AuthorizationExpired();
    error AIAgentINFT__TransferPending();
    error AIAgentINFT__NoTransferPending();
    error AIAgentINFT__InvalidDuration();
    error AIAgentINFT__ZeroAddress();
    error AIAgentINFT__InvalidStakeAmount();
    error AIAgentINFT__InsufficientStake();
    error AIAgentINFT__CooldownActive();
    error AIAgentINFT__TransferNotAllowed();
    error AIAgentINFT__OracleNotSet();

    // ============ Enums ============

    /// @notice Agent tier based on stake and performance
    enum AgentTier {
        NOVICE,     // 100 CRwN min stake
        SKILLED,    // 500 CRwN + performance requirements
        EXPERT,     // 2000 CRwN + performance requirements
        ORACLE      // 10000 CRwN + performance requirements
    }

    // ============ Structs ============

    /// @notice Authorization details for an executor
    struct Authorization {
        uint256 expiresAt;
        bool canExecute;
        bool canViewMetadata;
    }

    /// @notice Pending transfer details
    struct PendingTransfer {
        address from;
        address to;
        bytes32 requestId;
        uint256 initiatedAt;
        bool isPending;
    }

    /// @notice On-chain agent data
    struct AgentOnChainData {
        AgentTier tier;
        uint256 stakedAmount;
        bool isActive;
        bool copyTradingEnabled;
        uint256 createdAt;
        uint256 lastUpdatedAt;
    }

    /// @notice Agent performance metrics (read from external registry or stored here)
    struct AgentPerformance {
        uint256 totalTrades;
        uint256 winningTrades;
        int256 totalPnL;
        uint256 accuracyBps;
    }

    // ============ Constants ============
    // Testnet values (1 token minimum for easy testing)
    uint256 public constant MIN_STAKE_NOVICE = 1 ether;
    uint256 public constant MIN_STAKE_SKILLED = 5 ether;
    uint256 public constant MIN_STAKE_EXPERT = 20 ether;
    uint256 public constant MIN_STAKE_ORACLE = 100 ether;

    uint256 public constant SKILLED_MIN_TRADES = 100;
    uint256 public constant SKILLED_MIN_WINRATE = 5500;
    uint256 public constant EXPERT_MIN_TRADES = 500;
    uint256 public constant EXPERT_MIN_WINRATE = 6000;
    uint256 public constant ORACLE_MIN_TRADES = 2000;
    uint256 public constant ORACLE_MIN_WINRATE = 6500;

    uint256 public constant UNSTAKE_COOLDOWN = 7 days;
    uint256 public constant TRANSFER_TIMEOUT = 1 days;

    // ============ State ============
    IERC20 public immutable crownToken;
    IAgentINFTOracle public oracle;

    uint256 private _nextTokenId = 1;
    uint256 public totalStaked;

    // Token data
    mapping(uint256 => string) private _encryptedMetadataRefs;
    mapping(uint256 => bytes32) private _metadataHashes;
    mapping(uint256 => AgentOnChainData) private _agentData;
    mapping(uint256 => AgentPerformance) private _agentPerformance;

    // Authorization system
    mapping(uint256 => mapping(address => Authorization)) private _authorizations;

    // Pending transfers for re-encryption flow
    mapping(uint256 => PendingTransfer) private _pendingTransfers;

    // Unstake cooldown tracking
    mapping(address => uint256) public unstakeRequestTime;

    // ============ Events ============
    event INFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 metadataHash,
        string encryptedMetadataRef,
        uint256 stakedAmount
    );

    event MetadataUpdated(
        uint256 indexed tokenId,
        bytes32 oldHash,
        bytes32 newHash
    );

    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        uint256 expiresAt
    );

    event UsageRevoked(
        uint256 indexed tokenId,
        address indexed executor
    );

    event TransferInitiated(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bytes32 requestId
    );

    event TransferCompleted(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    event TransferCancelled(
        uint256 indexed tokenId,
        address indexed from
    );

    event StakeAdded(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 newTotal
    );

    event StakeWithdrawn(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 newTotal
    );

    event TierUpdated(
        uint256 indexed tokenId,
        AgentTier oldTier,
        AgentTier newTier
    );

    event TradeRecorded(
        uint256 indexed tokenId,
        bool won,
        int256 pnl
    );

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ============ Constructor ============
    constructor(
        address _crownToken,
        address _oracle
    ) ERC721("AI Agent iNFT", "AINFT") Ownable(msg.sender) {
        if (_crownToken == address(0)) revert AIAgentINFT__ZeroAddress();
        crownToken = IERC20(_crownToken);
        oracle = IAgentINFTOracle(_oracle);
    }

    // ============ Minting ============

    /**
     * @notice Mints a new AI Agent iNFT with encrypted metadata
     * @param encryptedMetadataRef Reference to encrypted metadata in 0G Storage
     * @param metadataHash keccak256 hash of the decrypted metadata
     * @param stakeAmount Initial stake amount (minimum 100 CRwN)
     * @param copyTradingEnabled Whether copy trading is enabled
     * @return tokenId The ID of the newly minted iNFT
     */
    function mint(
        string calldata encryptedMetadataRef,
        bytes32 metadataHash,
        uint256 stakeAmount,
        bool copyTradingEnabled
    ) external nonReentrant returns (uint256 tokenId) {
        if (bytes(encryptedMetadataRef).length == 0) {
            revert AIAgentINFT__InvalidEncryptedMetadataRef();
        }
        if (metadataHash == bytes32(0)) {
            revert AIAgentINFT__InvalidMetadataHash();
        }
        if (stakeAmount < MIN_STAKE_NOVICE) {
            revert AIAgentINFT__InvalidStakeAmount();
        }

        // Transfer stake
        crownToken.transferFrom(msg.sender, address(this), stakeAmount);

        tokenId = _nextTokenId++;

        _safeMint(msg.sender, tokenId);

        _encryptedMetadataRefs[tokenId] = encryptedMetadataRef;
        _metadataHashes[tokenId] = metadataHash;

        _agentData[tokenId] = AgentOnChainData({
            tier: AgentTier.NOVICE,
            stakedAmount: stakeAmount,
            isActive: true,
            copyTradingEnabled: copyTradingEnabled,
            createdAt: block.timestamp,
            lastUpdatedAt: block.timestamp
        });

        _agentPerformance[tokenId] = AgentPerformance({
            totalTrades: 0,
            winningTrades: 0,
            totalPnL: 0,
            accuracyBps: 0
        });

        totalStaked += stakeAmount;

        emit INFTMinted(tokenId, msg.sender, metadataHash, encryptedMetadataRef, stakeAmount);
    }

    /**
     * @notice Simple mint function for ERC-7857 interface compatibility
     */
    function mint(
        string calldata encryptedMetadataRef,
        bytes32 metadataHash
    ) external returns (uint256 tokenId) {
        return this.mint(encryptedMetadataRef, metadataHash, MIN_STAKE_NOVICE, true);
    }

    // ============ Transfer Functions ============

    /**
     * @notice Standard ERC-721 transfers are disabled for iNFTs
     * @dev Use transferWithReEncryption or initiateTransfer instead
     */
    function transferFrom(address, address, uint256) public pure override(ERC721, IERC721) {
        revert AIAgentINFT__TransferNotAllowed();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override(ERC721, IERC721) {
        revert AIAgentINFT__TransferNotAllowed();
    }

    /**
     * @notice Transfers an iNFT with secure re-encryption (synchronous)
     * @param from Current owner address
     * @param to New owner address
     * @param tokenId Token ID to transfer
     * @param sealedKey New encryption key sealed for recipient
     * @param proof Oracle proof of valid re-encryption
     */
    function transferWithReEncryption(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external nonReentrant {
        if (ownerOf(tokenId) != from) revert AIAgentINFT__NotOwner();
        if (msg.sender != from && !isApprovedForAll(from, msg.sender)) {
            revert AIAgentINFT__NotAuthorized();
        }
        if (to == address(0)) revert AIAgentINFT__ZeroAddress();
        if (_pendingTransfers[tokenId].isPending) revert AIAgentINFT__TransferPending();

        // Verify proof from oracle
        if (address(oracle) != address(0)) {
            if (!oracle.verifyProof(proof)) revert AIAgentINFT__InvalidProof();
        }

        // Update metadata reference from proof
        _updateMetadataFromProof(tokenId, sealedKey, proof);

        // Transfer token (stakes transfer with it)
        _transfer(from, to, tokenId);

        // Clear any authorizations from previous owner
        _clearAuthorizations(tokenId);

        emit TransferCompleted(tokenId, from, to);
    }

    /**
     * @notice Initiates an async transfer (for oracle re-encryption flow)
     * @param to Recipient address
     * @param tokenId Token ID to transfer
     * @return requestId Unique identifier for this transfer request
     */
    function initiateTransfer(
        address to,
        uint256 tokenId
    ) external nonReentrant returns (bytes32 requestId) {
        address from = ownerOf(tokenId);
        if (msg.sender != from && !isApprovedForAll(from, msg.sender)) {
            revert AIAgentINFT__NotAuthorized();
        }
        if (to == address(0)) revert AIAgentINFT__ZeroAddress();
        if (_pendingTransfers[tokenId].isPending) revert AIAgentINFT__TransferPending();
        if (address(oracle) == address(0)) revert AIAgentINFT__OracleNotSet();

        // Request re-encryption from oracle
        requestId = oracle.requestReEncryption(
            tokenId,
            from,
            to,
            _encryptedMetadataRefs[tokenId],
            _metadataHashes[tokenId]
        );

        _pendingTransfers[tokenId] = PendingTransfer({
            from: from,
            to: to,
            requestId: requestId,
            initiatedAt: block.timestamp,
            isPending: true
        });

        emit TransferInitiated(tokenId, from, to, requestId);
    }

    /**
     * @notice Completes a pending transfer after oracle re-encryption
     * @param tokenId Token ID being transferred
     * @param newEncryptedMetadataRef New encrypted metadata reference
     * @param newMetadataHash Hash of re-encrypted metadata
     * @param sealedKey New encryption key for recipient
     * @param proof Oracle proof of valid re-encryption
     */
    function completeTransfer(
        uint256 tokenId,
        string calldata newEncryptedMetadataRef,
        bytes32 newMetadataHash,
        bytes calldata sealedKey,
        bytes calldata proof
    ) external nonReentrant {
        PendingTransfer storage pending = _pendingTransfers[tokenId];
        if (!pending.isPending) revert AIAgentINFT__NoTransferPending();

        // Verify proof
        if (address(oracle) != address(0)) {
            if (!oracle.verifyReEncryption(
                pending.requestId,
                newMetadataHash,
                sealedKey,
                proof
            )) revert AIAgentINFT__InvalidProof();
        }

        address from = pending.from;
        address to = pending.to;

        // Update metadata
        bytes32 oldHash = _metadataHashes[tokenId];
        _encryptedMetadataRefs[tokenId] = newEncryptedMetadataRef;
        _metadataHashes[tokenId] = newMetadataHash;
        _agentData[tokenId].lastUpdatedAt = block.timestamp;

        emit MetadataUpdated(tokenId, oldHash, newMetadataHash);

        // Clear pending transfer
        delete _pendingTransfers[tokenId];

        // Transfer token (stakes transfer with it)
        _transfer(from, to, tokenId);

        // Clear authorizations
        _clearAuthorizations(tokenId);

        emit TransferCompleted(tokenId, from, to);
    }

    /**
     * @notice Cancels a pending transfer
     * @param tokenId Token ID with pending transfer
     */
    function cancelTransfer(uint256 tokenId) external {
        PendingTransfer storage pending = _pendingTransfers[tokenId];
        if (!pending.isPending) revert AIAgentINFT__NoTransferPending();

        address from = pending.from;
        if (msg.sender != from && msg.sender != owner()) {
            // Allow cancellation after timeout
            if (block.timestamp < pending.initiatedAt + TRANSFER_TIMEOUT) {
                revert AIAgentINFT__NotAuthorized();
            }
        }

        delete _pendingTransfers[tokenId];

        emit TransferCancelled(tokenId, from);
    }

    // ============ Authorization Functions ============

    /**
     * @notice Grants usage authorization to an executor
     * @param tokenId Token ID to authorize
     * @param executor Address being granted authorization
     * @param duration Duration in seconds
     */
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        uint256 duration
    ) external {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();
        if (executor == address(0)) revert AIAgentINFT__ZeroAddress();
        if (duration == 0) revert AIAgentINFT__InvalidDuration();

        uint256 expiresAt = block.timestamp + duration;

        _authorizations[tokenId][executor] = Authorization({
            expiresAt: expiresAt,
            canExecute: true,
            canViewMetadata: true
        });

        emit UsageAuthorized(tokenId, executor, expiresAt);
    }

    /**
     * @notice Revokes usage authorization
     * @param tokenId Token ID
     * @param executor Address to revoke
     */
    function revokeUsage(uint256 tokenId, address executor) external {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();

        delete _authorizations[tokenId][executor];

        emit UsageRevoked(tokenId, executor);
    }

    /**
     * @notice Checks if an address is authorized to execute
     * @param tokenId Token ID
     * @param executor Address to check
     * @return True if authorized and not expired
     */
    function isAuthorizedExecutor(
        uint256 tokenId,
        address executor
    ) public view returns (bool) {
        if (ownerOf(tokenId) == executor) return true;

        Authorization storage auth = _authorizations[tokenId][executor];
        return auth.canExecute && auth.expiresAt > block.timestamp;
    }

    /**
     * @notice Gets authorization details
     * @param tokenId Token ID
     * @param executor Address to check
     * @return Authorization struct
     */
    function getAuthorization(
        uint256 tokenId,
        address executor
    ) external view returns (Authorization memory) {
        return _authorizations[tokenId][executor];
    }

    // ============ Staking Functions ============

    /**
     * @notice Add stake to an agent iNFT
     * @param tokenId Token ID
     * @param amount Amount to stake
     */
    function addStake(uint256 tokenId, uint256 amount) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();
        if (amount == 0) revert AIAgentINFT__InvalidStakeAmount();

        crownToken.transferFrom(msg.sender, address(this), amount);

        AgentOnChainData storage data = _agentData[tokenId];
        data.stakedAmount += amount;
        data.lastUpdatedAt = block.timestamp;
        totalStaked += amount;

        // Check for tier upgrade
        _updateTier(tokenId);

        emit StakeAdded(tokenId, amount, data.stakedAmount);
    }

    /**
     * @notice Request stake withdrawal (starts cooldown)
     * @param tokenId Token ID
     */
    function requestUnstake(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();
        unstakeRequestTime[msg.sender] = block.timestamp;
    }

    /**
     * @notice Withdraw stake after cooldown
     * @param tokenId Token ID
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 tokenId, uint256 amount) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();
        if (block.timestamp < unstakeRequestTime[msg.sender] + UNSTAKE_COOLDOWN) {
            revert AIAgentINFT__CooldownActive();
        }

        AgentOnChainData storage data = _agentData[tokenId];
        if (amount > data.stakedAmount) revert AIAgentINFT__InsufficientStake();

        // Ensure minimum stake for active agents
        if (data.isActive && data.stakedAmount - amount < MIN_STAKE_NOVICE) {
            revert AIAgentINFT__InsufficientStake();
        }

        data.stakedAmount -= amount;
        data.lastUpdatedAt = block.timestamp;
        totalStaked -= amount;

        crownToken.transfer(msg.sender, amount);

        // Update tier
        _updateTier(tokenId);

        emit StakeWithdrawn(tokenId, amount, data.stakedAmount);
    }

    // ============ Agent Configuration ============

    /**
     * @notice Toggle copy trading
     * @param tokenId Token ID
     * @param enabled Whether to enable copy trading
     */
    function setCopyTradingEnabled(uint256 tokenId, bool enabled) external {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();

        _agentData[tokenId].copyTradingEnabled = enabled;
        _agentData[tokenId].lastUpdatedAt = block.timestamp;
    }

    /**
     * @notice Toggle agent active status
     * @param tokenId Token ID
     * @param active Whether agent is active
     */
    function setAgentActive(uint256 tokenId, bool active) external {
        if (ownerOf(tokenId) != msg.sender) revert AIAgentINFT__NotOwner();

        if (active && _agentData[tokenId].stakedAmount < MIN_STAKE_NOVICE) {
            revert AIAgentINFT__InsufficientStake();
        }

        _agentData[tokenId].isActive = active;
        _agentData[tokenId].lastUpdatedAt = block.timestamp;
    }

    // ============ Performance Recording ============

    /**
     * @notice Record a trade result (called by authorized contracts)
     * @param tokenId Token ID
     * @param won Whether the trade won
     * @param pnl Profit/loss amount
     */
    function recordTrade(
        uint256 tokenId,
        bool won,
        int256 pnl
    ) external {
        // In production, add access control for authorized callers (PredictionMarket, ArenaFactory)
        AgentPerformance storage perf = _agentPerformance[tokenId];

        perf.totalTrades++;
        perf.totalPnL += pnl;

        if (won) {
            perf.winningTrades++;
        }

        // Update accuracy
        if (perf.totalTrades > 0) {
            perf.accuracyBps = (perf.winningTrades * 10000) / perf.totalTrades;
        }

        _agentData[tokenId].lastUpdatedAt = block.timestamp;

        // Check for tier upgrade
        _updateTier(tokenId);

        emit TradeRecorded(tokenId, won, pnl);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the oracle address
     * @param _oracle New oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        address oldOracle = address(oracle);
        oracle = IAgentINFTOracle(_oracle);
        emit OracleUpdated(oldOracle, _oracle);
    }

    // ============ View Functions ============

    function getEncryptedMetadataRef(uint256 tokenId) external view returns (string memory) {
        return _encryptedMetadataRefs[tokenId];
    }

    function getMetadataHash(uint256 tokenId) external view returns (bytes32) {
        return _metadataHashes[tokenId];
    }

    function getPendingTransfer(uint256 tokenId) external view returns (PendingTransfer memory) {
        return _pendingTransfers[tokenId];
    }

    function getAgentData(uint256 tokenId) external view returns (AgentOnChainData memory) {
        return _agentData[tokenId];
    }

    function getAgentPerformance(uint256 tokenId) external view returns (AgentPerformance memory) {
        return _agentPerformance[tokenId];
    }

    function getAgentTier(uint256 tokenId) external view returns (AgentTier) {
        return _agentData[tokenId].tier;
    }

    function getAgentStake(uint256 tokenId) external view returns (uint256) {
        return _agentData[tokenId].stakedAmount;
    }

    function isAgentActive(uint256 tokenId) external view returns (bool) {
        return _agentData[tokenId].isActive;
    }

    function isCopyTradingEnabled(uint256 tokenId) external view returns (bool) {
        return _agentData[tokenId].copyTradingEnabled;
    }

    // ============ ERC-165 Interface Support ============

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return
            interfaceId == IERC7857_INTERFACE_ID ||
            super.supportsInterface(interfaceId);
    }

    // ============ Internal Functions ============

    function _updateMetadataFromProof(
        uint256 tokenId,
        bytes calldata sealedKey,
        bytes calldata proof
    ) internal {
        // Extract new metadata info from proof
        if (proof.length >= 64) {
            bytes32 newHash = bytes32(proof[0:32]);
            if (newHash != bytes32(0)) {
                bytes32 oldHash = _metadataHashes[tokenId];
                _metadataHashes[tokenId] = newHash;
                _agentData[tokenId].lastUpdatedAt = block.timestamp;
                emit MetadataUpdated(tokenId, oldHash, newHash);
            }

            // Update encrypted URI if provided
            if (proof.length > 64) {
                string memory newRef = string(proof[64:]);
                if (bytes(newRef).length > 0) {
                    _encryptedMetadataRefs[tokenId] = newRef;
                }
            }
        }
    }

    function _clearAuthorizations(uint256 tokenId) internal {
        // Note: In production, track authorized addresses for complete clearing
        // For now, authorizations expire naturally
    }

    function _updateTier(uint256 tokenId) internal {
        AgentOnChainData storage data = _agentData[tokenId];
        AgentPerformance storage perf = _agentPerformance[tokenId];

        AgentTier oldTier = data.tier;
        AgentTier newTier = _calculateTier(
            data.stakedAmount,
            perf.totalTrades,
            perf.accuracyBps
        );

        if (newTier != oldTier) {
            data.tier = newTier;
            emit TierUpdated(tokenId, oldTier, newTier);
        }
    }

    function _calculateTier(
        uint256 stake,
        uint256 trades,
        uint256 winRateBps
    ) internal pure returns (AgentTier) {
        if (stake >= MIN_STAKE_ORACLE && trades >= ORACLE_MIN_TRADES && winRateBps >= ORACLE_MIN_WINRATE) {
            return AgentTier.ORACLE;
        }
        if (stake >= MIN_STAKE_EXPERT && trades >= EXPERT_MIN_TRADES && winRateBps >= EXPERT_MIN_WINRATE) {
            return AgentTier.EXPERT;
        }
        if (stake >= MIN_STAKE_SKILLED && trades >= SKILLED_MIN_TRADES && winRateBps >= SKILLED_MIN_WINRATE) {
            return AgentTier.SKILLED;
        }
        return AgentTier.NOVICE;
    }
}
