import { cronHandler } from '@/server/cron/handler';
import { keepAlive } from '@/server/cron/keep-alive';

export const GET = cronHandler(keepAlive);
