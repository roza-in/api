import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QueueService } from './queue.service';

@Module({})
export class BullBoardModule implements OnModuleInit {
  private readonly logger = new Logger(BullBoardModule.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit(): void {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const queues = this.queueService.getAllQueues();

    createBullBoard({
      queues: queues.map((queue) => new BullMQAdapter(queue)),
      serverAdapter,
    });

    const httpAdapter = this.httpAdapterHost.httpAdapter;
    httpAdapter.use('/admin/queues', serverAdapter.getRouter());

    this.logger.log('Bull Board dashboard mounted at /admin/queues');
  }
}
