import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';
import { buildPayslipHtml, PayslipHtmlData } from './payslip.template';

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.browserPromise) {
      return this.browserPromise;
    }

    this.browserPromise = (async () => {
      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        browser.on('disconnected', () => {
          this.logger.warn('Puppeteer browser disconnected. Will recreate on next request.');
          this.browser = null;
          this.browserPromise = null;
        });

        this.browser = browser;
        return browser;
      } finally {
        this.browserPromise = null;
      }
    })();

    return this.browserPromise;
  }

  async generatePayslipPdf(data: PayslipHtmlData): Promise<Buffer> {
    const html = buildPayslipHtml(data);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
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
      await page.close().catch((err) => {
        this.logger.warn(`Failed to close page cleanly: ${err?.message}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err: any) {
        this.logger.warn(`Error closing browser onModuleDestroy: ${err?.message}`);
      }
      this.browser = null;
      this.browserPromise = null;
    }
  }
}
