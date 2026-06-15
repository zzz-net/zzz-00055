import { EventStatus, STATUS_LABELS } from '../../../shared/types';

interface StatusBadgeProps {
  status: EventStatus;
}

const STATUS_COLORS: Record<EventStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  need_rectify: 'bg-red-100 text-red-800 border-red-300',
  reviewed: 'bg-blue-100 text-blue-800 border-blue-300',
  closed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-gray-100 text-gray-800 border-gray-300',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
