import React from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Ban, Loader } from 'lucide-react';

interface ResolutionStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const statusConfig = {
  pending: {
    label: 'Pending',
    color: 'bg-blue-500',
    textColor: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Clock,
    description: 'Waiting for scheduled time',
  },
  ready: {
    label: 'Ready',
    color: 'bg-green-500',
    textColor: 'text-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: CheckCircle,
    description: 'Ready to execute',
    pulse: true,
  },
  executing: {
    label: 'Executing',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: Loader,
    description: 'Transaction in progress',
    spin: true,
  },
  completed: {
    label: 'Completed',
    color: 'bg-gray-500',
    textColor: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: CheckCircle,
    description: 'Successfully executed',
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500',
    textColor: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: XCircle,
    description: 'Execution failed',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-400',
    textColor: 'text-gray-400',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    icon: Ban,
    description: 'Resolution cancelled',
  },
};

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    icon: 'w-3 h-3',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    badge: 'px-3 py-1 text-sm',
    icon: 'w-4 h-4',
    dot: 'w-2 h-2',
  },
  lg: {
    badge: 'px-4 py-1.5 text-base',
    icon: 'w-5 h-5',
    dot: 'w-2.5 h-2.5',
  },
};

export const ResolutionStatusBadge: React.FC<ResolutionStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${sizes.badge}
        ${config.bgColor}
        ${config.textColor}
        border ${config.borderColor}
      `}
      title={config.description}
    >
      {showIcon && (
        <div className="relative">
          <Icon
            className={`
              ${sizes.icon}
              ${config.spin ? 'animate-spin' : ''}
            `}
          />
          {config.pulse && (
            <span className={`absolute inset-0 animate-ping ${config.color} ${sizes.dot} rounded-full opacity-75`} />
          )}
        </div>
      )}
      <span>{config.label}</span>
    </div>
  );
};

// Oracle source badge
interface OracleSourceBadgeProps {
  source: string;
  size?: 'sm' | 'md' | 'lg';
}

const oracleConfig = {
  polymarket: {
    label: 'Polymarket',
    color: 'bg-purple-500',
    textColor: 'text-white',
    borderColor: 'border-purple-600',
  },
  kalshi: {
    label: 'Kalshi',
    color: 'bg-blue-600',
    textColor: 'text-white',
    borderColor: 'border-blue-700',
  },
  internal: {
    label: 'Internal',
    color: 'bg-indigo-500',
    textColor: 'text-white',
    borderColor: 'border-indigo-600',
  },
};

export const OracleSourceBadge: React.FC<OracleSourceBadgeProps> = ({
  source,
  size = 'md',
}) => {
  const config = oracleConfig[source.toLowerCase() as keyof typeof oracleConfig] || oracleConfig.internal;
  const sizes = sizeConfig[size];

  return (
    <div
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${sizes.badge}
        ${config.color}
        ${config.textColor}
        border ${config.borderColor}
      `}
    >
      <span>{config.label}</span>
    </div>
  );
};

// Outcome badge
interface OutcomeBadgeProps {
  outcome: boolean | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

export const OutcomeBadge: React.FC<OutcomeBadgeProps> = ({
  outcome,
  size = 'md',
}) => {
  const sizes = sizeConfig[size];

  if (outcome === null || outcome === undefined) {
    return (
      <div
        className={`
          inline-flex items-center gap-1.5 rounded-full font-medium
          ${sizes.badge}
          bg-gray-100 text-gray-500 border border-gray-300
        `}
      >
        <AlertCircle className={sizes.icon} />
        <span>Pending</span>
      </div>
    );
  }

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${sizes.badge}
        ${outcome ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}
      `}
    >
      {outcome ? (
        <>
          <CheckCircle className={sizes.icon} />
          <span>YES</span>
        </>
      ) : (
        <>
          <XCircle className={sizes.icon} />
          <span>NO</span>
        </>
      )}
    </div>
  );
};
