import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Separate borders, because collapsed borders on a sticky header cell scroll away with the body. */
function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table data-slot="table" className={cn('w-full border-separate border-spacing-0 text-body', className)} {...props} />;
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('transition-colors duration-(--duration-fast) ease-standard', className)} {...props} />;
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('min-h-11 border-b border-border bg-bg-subtle px-cell-x sm:h-11 text-start align-middle text-label whitespace-nowrap text-text-secondary', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('min-h-row-h border-b border-border px-cell-x py-1.5 align-middle sm:h-row-h', className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
