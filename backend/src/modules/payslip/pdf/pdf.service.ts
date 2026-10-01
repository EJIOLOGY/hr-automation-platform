import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { buildPayslipHtml, PayslipHtmlData } from './payslip.template';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generatePayslipPdf(data: PayslipHtmlData): Promise<Buffer> {
    const html = buildPayslipHtml(data);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('Failed to generate PDF', error);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
