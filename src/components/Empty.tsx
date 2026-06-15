import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export default function Empty({ icon, title, description, className }: EmptyProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 text-center',
      className
    )}>
      {icon && (
        <div className="mb-4">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="text-lg font-medium text-slate-300 mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-slate-500 max-w-md">{description}</p>
      )}
      {!icon && !title && !description && (
        <span className="text-slate-500">Empty</span>
      )}
    </div>
  );
}
