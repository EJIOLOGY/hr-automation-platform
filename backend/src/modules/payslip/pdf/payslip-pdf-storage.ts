import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface StoredPdfBlob {
  id: string;
  contentHash: string;
  templateVersion: string;
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
}

export interface PayslipPdfStorage {
  put(contentHash: string, templateVersion: string, bytes: Buffer): Promise<StoredPdfBlob>;
  get(blobId: string): Promise<StoredPdfBlob | null>;
  getByHash(contentHash: string, templateVersion: string): Promise<StoredPdfBlob | null>;
  exists(contentHash: string, templateVersion: string): Promise<boolean>;
}

@Injectable()
export class PostgresPayslipPdfStorage implements PayslipPdfStorage {
  constructor(private readonly prisma: PrismaService) {}

  async put(contentHash: string, templateVersion: string, bytes: Buffer): Promise<StoredPdfBlob> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const sizeBytes = bytes.length;

    const record = await this.prisma.payslipPdfBlob.upsert({
      where: {
        contentHash_templateVersion: {
          contentHash,
          templateVersion,
        },
      },
      create: {
        contentHash,
        templateVersion,
        bytes: new Uint8Array(bytes),
        sizeBytes,
        sha256,
      },
      update: {}, // Immutable: if blob already exists for (contentHash, templateVersion), keep it
    });

    return {
      id: record.id,
      contentHash: record.contentHash,
      templateVersion: record.templateVersion,
      bytes: Buffer.from(record.bytes),
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
    };
  }

  async get(blobId: string): Promise<StoredPdfBlob | null> {
    const record = await this.prisma.payslipPdfBlob.findUnique({
      where: { id: blobId },
    });
    if (!record) return null;
    return {
      id: record.id,
      contentHash: record.contentHash,
      templateVersion: record.templateVersion,
      bytes: Buffer.from(record.bytes),
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
    };
  }

  async getByHash(contentHash: string, templateVersion: string): Promise<StoredPdfBlob | null> {
    const record = await this.prisma.payslipPdfBlob.findUnique({
      where: {
        contentHash_templateVersion: {
          contentHash,
          templateVersion,
        },
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      contentHash: record.contentHash,
      templateVersion: record.templateVersion,
      bytes: Buffer.from(record.bytes),
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
    };
  }

  async exists(contentHash: string, templateVersion: string): Promise<boolean> {
    const count = await this.prisma.payslipPdfBlob.count({
      where: {
        contentHash,
        templateVersion,
      },
    });
    return count > 0;
  }
}
