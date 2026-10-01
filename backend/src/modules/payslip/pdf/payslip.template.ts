export interface PayslipHtmlData {
  companyName: string;
  payingCompany: string;
  employeeName: string;
  staffId: string;
  jobTitle: string;
  department: string;
  month: string;
  year: number;
  daysWorked: number;
  totalDays: number;
  lines: Array<{
    name: string;
    kind: 'BASE' | 'ARREARS';
    taxClass: string;
    amount: number;
    isDeduction?: boolean;
  }>;
  consultantGrossPay: number;
  grossEarnings: number;
  wht: number;
  otherDeduction: number;
  totalDeductions: number;
  nonTaxableAllowancesTotal: number;
  netServiceFee: number;
  engineVersion: string;
  generatedAt: string;
}

function fmt(n: number): string {
  return `₦${n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')}`;
}

export function buildPayslipHtml(data: PayslipHtmlData): string {
  const baseLines = data.lines.filter(l => l.kind === 'BASE');
  const arrearsLines = data.lines.filter(l => l.kind === 'ARREARS');

  const renderLine = (line: PayslipHtmlData['lines'][0]) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        ${line.name} ${line.kind === 'ARREARS' ? '<span style="color: #666; font-size: 0.9em;">(Arrears)</span>' : ''}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">
        ${line.isDeduction ? '-' : ''}${fmt(line.amount)}
      </td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Payslip - ${data.employeeName}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.4; font-size: 12px; margin: 0; padding: 0; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 4px; border-bottom: 3px solid #1a56db; }
        .header h1 { margin: 0 0 10px 0; font-size: 24px; color: #1a56db; }
        .header p { margin: 0; font-size: 14px; color: #666; }
        .employee-details { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .employee-details th, .employee-details td { padding: 8px; border: 1px solid #ddd; text-align: left; }
        .employee-details th { background-color: #f8f9fa; width: 25%; font-weight: bold; color: #444; }
        .section-title { font-size: 16px; font-weight: bold; color: #1a56db; margin-bottom: 10px; border-bottom: 2px solid #1a56db; padding-bottom: 5px; }
        .lines-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .lines-table th { background-color: #1a56db; color: white; text-align: left; padding: 10px; font-size: 13px; }
        .lines-table tr:nth-child(even) td { background-color: #fafafa; }
        .summary-box { width: 50%; float: right; border: 1px solid #ddd; border-radius: 4px; padding: 15px; background-color: #f8f9fa; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .summary-row.bold { font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 8px; }
        .summary-row.total { font-weight: bold; font-size: 16px; color: #1a56db; border-top: 2px solid #1a56db; padding-top: 10px; margin-top: 10px; }
        .clearfix::after { content: ""; clear: both; display: table; }
        .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 10px; clear: both; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${data.companyName}</h1>
          <p>Payslip for ${data.month} ${data.year}</p>
          ${data.payingCompany !== data.companyName ? `<p>Paying Entity: ${data.payingCompany}</p>` : ''}
        </div>

        <table class="employee-details">
          <tr>
            <th>Employee Name</th>
            <td>${data.employeeName}</td>
            <th>Staff ID</th>
            <td>${data.staffId}</td>
          </tr>
          <tr>
            <th>Job Title</th>
            <td>${data.jobTitle}</td>
            <th>Department</th>
            <td>${data.department}</td>
          </tr>
          <tr>
            <th>Days Worked</th>
            <td>${data.daysWorked} / ${data.totalDays}</td>
            <th></th>
            <td></td>
          </tr>
        </table>

        <div class="section-title">Earnings & Deductions</div>
        <table class="lines-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${baseLines.map(renderLine).join('')}
            ${arrearsLines.length > 0 ? `<tr><td colspan="2" style="padding: 10px; background-color: #eee; font-weight: bold;">Arrears</td></tr>` + arrearsLines.map(renderLine).join('') : ''}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <span>Consultant Gross Pay:</span>
            <span>${fmt(data.consultantGrossPay)}</span>
          </div>
          <div class="summary-row bold">
            <span>Gross Earnings:</span>
            <span>${fmt(data.grossEarnings)}</span>
          </div>
          <div class="summary-row">
            <span>WHT (5%):</span>
            <span>-${fmt(data.wht)}</span>
          </div>
          <div class="summary-row">
            <span>Other Deductions:</span>
            <span>-${fmt(data.otherDeduction)}</span>
          </div>
          <div class="summary-row bold">
            <span>Total Deductions:</span>
            <span>-${fmt(data.totalDeductions)}</span>
          </div>
          <div class="summary-row">
            <span>Non-Taxable Allowances:</span>
            <span>${fmt(data.nonTaxableAllowancesTotal)}</span>
          </div>
          <div class="summary-row total">
            <span>Net Service Fee:</span>
            <span>${fmt(data.netServiceFee)}</span>
          </div>
        </div>
        <div class="clearfix"></div>

        <div class="footer">
          Generated on ${data.generatedAt} (Engine: ${data.engineVersion})
        </div>
      </div>
    </body>
    </html>
  `;
}
