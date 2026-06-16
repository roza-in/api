import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { v4 as uuidv4 } from 'uuid';
import { QUEUE_REPORTS } from '../queue/queue.constants';
import { ExportReportDto } from './dto/export-report.dto';
import { RefundStatus } from '../../generated/prisma';

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_REPORTS) private readonly reportsQueue: Queue,
  ) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  formatDateKolkata(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .format(date)
      .replace(/\//g, '-');
  }

  formatTimeKolkata(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  formatDateTimeKolkata(date: Date): string {
    const d = this.formatDateKolkata(date);
    const t = this.formatTimeKolkata(date);
    return `${d} ${t}`;
  }

  parseReportDates(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(end.getDate() - 30));

    if (start > end) {
      throw new BadRequestException(
        'Start date must be before or equal to end date',
      );
    }

    const startBoundary = new Date(start);
    startBoundary.setHours(0, 0, 0, 0);

    const endBoundary = new Date(end);
    endBoundary.setHours(23, 59, 59, 999);

    return { start: startBoundary, end: endBoundary };
  }

  async queueExportReport(
    businessId: string,
    userId: string,
    dto: ExportReportDto,
  ): Promise<{ jobId: string; status: string }> {
    const jobId = uuidv4();

    await this.redis.set(
      `reports:status:${jobId}`,
      JSON.stringify({
        status: 'PENDING',
        businessId,
        metadata: {
          reportType: dto.reportType,
          startDate: dto.startDate,
          endDate: dto.endDate,
          format: dto.format,
          queuedAt: new Date().toISOString(),
        },
      }),
      'EX',
      86400, // 24 hours
    );

    await this.reportsQueue.add(
      'generate-report',
      {
        businessId,
        userId,
        reportType: dto.reportType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        format: dto.format,
        jobId,
      },
      { jobId },
    );

    return { jobId, status: 'PENDING' };
  }

  async getExportStatus(
    businessId: string,
    jobId: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.redis.get(`reports:status:${jobId}`);
    if (!data) {
      throw new NotFoundException('Export job not found');
    }
    const parsed = JSON.parse(data) as {
      businessId: string;
      status: string;
      fileUrl?: string;
      error?: string;
      metadata: Record<string, unknown>;
    };

    if (parsed.businessId !== businessId) {
      throw new ForbiddenException('You do not have access to this export job');
    }

    return {
      status: parsed.status,
      fileUrl: parsed.fileUrl,
      error: parsed.error,
      metadata: parsed.metadata,
    };
  }

  async exportReport(
    businessId: string,
    userId: string,
    reportType: 'appointments' | 'revenue' | 'customers',
    startDate?: string,
    endDate?: string,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv',
  ): Promise<string> {
    const { start, end } = this.parseReportDates(startDate, endDate);

    let title = '';
    let headers: string[] = [];
    let rows: any[][] = [];

    if (reportType === 'appointments') {
      title = 'Appointments Report';
      headers = [
        'Date',
        'Time',
        'Customer Name',
        'Customer Phone',
        'Staff Name',
        'Service Name',
        'Price (INR)',
        'Status',
      ];

      const appointments = await this.prisma.appointment.findMany({
        where: {
          businessId,
          startTime: { gte: start, lte: end },
          deletedAt: null,
        },
        include: {
          customer: true,
          staff: true,
          service: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

      rows = appointments.map((a) => [
        this.formatDateKolkata(a.startTime),
        this.formatTimeKolkata(a.startTime),
        a.customer.name,
        a.customer.phone,
        a.staff.name,
        a.service.name,
        (Number(a.service.price) / 100).toFixed(2),
        a.status,
      ]);
    } else if (reportType === 'revenue') {
      title = 'Revenue Report';
      headers = [
        'Date',
        'Payment ID',
        'Invoice Number',
        'Customer Name',
        'Service Name',
        'Gross Amount (INR)',
        'Refunded Amount (INR)',
        'Net Amount (INR)',
        'Status',
      ];

      const payments = await this.prisma.payment.findMany({
        where: {
          businessId,
          createdAt: { gte: start, lte: end },
        },
        include: {
          appointment: {
            include: {
              customer: true,
              service: true,
              invoices: true,
            },
          },
          refunds: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      rows = payments.map((p) => {
        const gross = Number(p.amount) / 100;
        const refunded =
          p.refunds
            .filter((r) => r.status === RefundStatus.PROCESSED)
            .reduce((sum, r) => sum + Number(r.amount), 0) / 100;
        const net = gross - refunded;
        const invoiceNum = p.appointment.invoices[0]?.invoiceNumber || 'N/A';

        return [
          this.formatDateKolkata(p.createdAt),
          p.providerPaymentId || 'N/A',
          invoiceNum,
          p.appointment.customer.name,
          p.appointment.service.name,
          gross.toFixed(2),
          refunded.toFixed(2),
          net.toFixed(2),
          p.status,
        ];
      });
    } else if (reportType === 'customers') {
      title = 'Customers CRM Report';
      headers = [
        'Customer Name',
        'Phone',
        'Email',
        'Total Appointments',
        'Total Spent (INR)',
        'Last Visit',
      ];

      const customers = await this.prisma.customer.findMany({
        where: {
          businessId,
          deletedAt: null,
          ...(startDate && endDate
            ? { createdAt: { gte: start, lte: end } }
            : {}),
        },
        include: {
          appointments: {
            where: { deletedAt: null },
            orderBy: { startTime: 'desc' },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      rows = customers.map((c) => {
        const totalSpent = Number(c.totalSpent) / 100;
        const lastAppt = c.appointments[0];
        const lastVisit = lastAppt
          ? this.formatDateKolkata(lastAppt.startTime)
          : 'N/A';

        return [
          c.name,
          c.phone,
          c.email || 'N/A',
          c.appointments.length,
          totalSpent.toFixed(2),
          lastVisit,
        ];
      });
    }

    const metadata: Record<string, string> = {
      'Generated At': this.formatDateTimeKolkata(new Date()),
      'Generated By': userId,
      'Date Range': `${this.formatDateKolkata(start)} to ${this.formatDateKolkata(end)}`,
    };

    let buffer: Buffer;

    if (format === 'csv') {
      buffer = this.generateCsv(title, headers, rows, metadata);
    } else if (format === 'xlsx') {
      buffer = await this.generateXlsx(title, headers, rows, metadata);
    } else {
      buffer = await this.generatePdf(title, headers, rows, metadata);
    }

    const originalname = `${reportType}_report_${Date.now()}.${format}`;
    let mimetype = 'text/csv';
    if (format === 'xlsx') {
      mimetype =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'pdf') {
      mimetype = 'application/pdf';
    }

    const fileUrl = await this.storageService.uploadFile(
      businessId,
      {
        buffer,
        originalname,
        mimetype,
        size: buffer.length,
      },
      'exports',
    );

    const reportId = uuidv4();
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'EXPORT',
        entity: 'Report',
        entityId: reportId,
        metadata: {
          reportType,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          format,
          fileUrl,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return fileUrl;
  }

  private generateCsv(
    title: string,
    headers: string[],
    rows: any[][],
    metadata: Record<string, string>,
  ): Buffer {
    let content = '';
    content += `"Report Title","${title.replace(/"/g, '""')}"\n`;
    for (const [key, val] of Object.entries(metadata)) {
      content += `"${key.replace(/"/g, '""')}","${String(val).replace(/"/g, '""')}"\n`;
    }
    content += '\n';

    content +=
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

    for (const row of rows) {
      content +=
        row
          .map((cell) => {
            const cellVal =
              cell === null || cell === undefined ? '' : String(cell);
            return `"${cellVal.replace(/"/g, '""')}"`;
          })
          .join(',') + '\n';
    }

    return Buffer.from(content, 'utf-8');
  }

  private async generateXlsx(
    title: string,
    headers: string[],
    rows: any[][],
    metadata: Record<string, string>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    worksheet.addRow(['Report Title', title]);
    worksheet.getRow(1).getCell(1).font = { bold: true };
    worksheet.getRow(1).getCell(2).font = { bold: true };

    for (const [key, val] of Object.entries(metadata)) {
      worksheet.addRow([key, val]);
    }

    worksheet.addRow([]);

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A365D' },
      };
    });

    for (const row of rows) {
      worksheet.addRow(row);
    }

    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      if (column.eachCell) {
        column.eachCell({ includeEmpty: true }, (cell) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const value = cell.value ? String(cell.value) : '';
          if (value.length > maxLength) {
            maxLength = value.length;
          }
        });
      }
      column.width = maxLength + 3;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  private async generatePdf(
    title: string,
    headers: string[],
    rows: any[][],
    metadata: Record<string, string>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.fillColor('#1A365D').fontSize(22).text(title, { align: 'center' });
      doc.moveDown(0.5);

      doc.fillColor('#4A5568').fontSize(10);
      for (const [key, val] of Object.entries(metadata)) {
        doc.text(`${key}: ${val}`);
      }
      doc.moveDown(1.5);

      const pageWidth = doc.page.width - 80;
      const colWidth = pageWidth / headers.length;
      let startY = doc.y;

      doc.rect(40, startY - 5, pageWidth, 20).fill('#1A365D');
      doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, index) => {
        doc.text(header, 45 + index * colWidth, startY, {
          width: colWidth - 10,
          align: 'left',
          ellipsis: true,
        });
      });

      startY += 20;
      doc.font('Helvetica').fillColor('#2D3748');

      rows.forEach((row, rowIndex) => {
        if (startY > doc.page.height - 60) {
          doc.addPage();
          startY = 40;
          doc.rect(40, startY - 5, pageWidth, 20).fill('#1A365D');
          doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
          headers.forEach((header, index) => {
            doc.text(header, 45 + index * colWidth, startY, {
              width: colWidth - 10,
              align: 'left',
              ellipsis: true,
            });
          });
          startY += 20;
          doc.font('Helvetica').fillColor('#2D3748');
        }

        if (rowIndex % 2 === 1) {
          doc.rect(40, startY - 3, pageWidth, 15).fill('#F7FAFC');
          doc.fillColor('#2D3748');
        }

        row.forEach((cell, cellIndex) => {
          const textVal =
            cell === null || cell === undefined ? '' : String(cell);
          doc.text(textVal, 45 + cellIndex * colWidth, startY, {
            width: colWidth - 10,
            align: 'left',
            ellipsis: true,
          });
        });
        startY += 15;
      });

      doc.end();
    });
  }
}
