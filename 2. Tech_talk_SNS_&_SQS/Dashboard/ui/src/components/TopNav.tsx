/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {FlowState, WorkerKey, QueueStatus} from '@/app/visualizer/page';

type Props = {
  title: any;
  state?: FlowState;
  queues?: Record<WorkerKey, QueueStatus>;
};

export function TopNav({ title }: Props) {
  const pathname = usePathname();
  const isMonitor = pathname?.startsWith('/monitor') ?? false;
  const isVisualizer = pathname?.startsWith('/visualizer') ?? false;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-xl font-bold text-slate-100 mt-7">
        {title ?? <>SNS → SQS <span className="text-slate-400 text-base">demo</span></>}
      </div>

      <div className="flex items-center gap-2">
        {/* Botones de navegación con estado activo */}
        <Button asChild variant={isMonitor ? 'default' : 'secondary'}>
          <Link href="/monitor">Monitor</Link>
        </Button>
        <Button asChild variant={isVisualizer ? 'default' : 'secondary'}>
          <Link href="/visualizer">Visualizer</Link>
        </Button>
      </div>
    </div>
  );
}
