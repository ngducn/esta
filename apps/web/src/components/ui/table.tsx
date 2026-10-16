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
      className={cn('border-b border-rule bg-ground px-3 py-2 text-start align-bottom text-small font-semibold text-ink-muted', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('border-b border-rule px-3 py-2 align-middle', className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
