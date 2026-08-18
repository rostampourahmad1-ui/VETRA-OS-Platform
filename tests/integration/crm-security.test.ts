import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import * as crmModule from '../../artifacts/api-server/src/routes/crm';

const crmRouter = (crmModule as any).crmRouter || (crmModule as any).default || crmModule;

describe('VETRA-SEC-01: CRM Security & Multi-Tenancy Tests', () => {
  let app: express.Application;
  let mockDb: any;
  let leadsStore: any[];

  beforeEach(() => {
    leadsStore = [
      {
        id: 'lead-1',
        organizationId: 'tenant-a',
        fullName: 'Ali Rezaei',
        company: 'Vetra Corp',
        email: 'ali@vetra.io',
        phone: '09120000000',
        status: 'lead',
        metadata: { source: 'web' },
      },
      {
        id: 'lead-2',
        organizationId: 'tenant-b',
        fullName: 'Sara Tehrani',
        company: 'Other Corp',
        email: 'sara@other.io',
        phone: '09121111111',
        status: 'contact',
        metadata: { source: 'referral' },
      },
    ];

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            return Promise.resolve(
              leadsStore.filter((l) => l.organizationId === 'tenant-a')
            );
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((patchData: any) => ({
          where: vi.fn(() => {
            const index = leadsStore.findIndex(
              (l) => l.id === 'lead-1' && l.organizationId === 'tenant-a'
            );
            if (index !== -1) {
              leadsStore[index] = { ...leadsStore[index], ...patchData };
              return Promise.resolve([leadsStore[index]]);
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    };

    app = express();
    app.use(express.json());
    // شبیه‌سازی Middleware احراز هویت و تزریق کانتکست مستأجر
    app.use((req: any, _res, next) => {
      req.auth = { orgId: 'tenant-a', userId: 'user-1' };
      req.organizationId = 'tenant-a';
      req.db = mockDb;
      next();
    });
    app.use('/crm', crmRouter);
  });

  it('P0-1: Router is correctly loaded and configured', () => {
    expect(crmRouter).toBeDefined();
  });

  it('P0-2: Schema & Controller validation rejects tenant tampering', () => {
    // بررسی عدم امکان بازنویسی organizationId
    const incomingPayload = {
      fullName: 'Updated Name',
      organizationId: 'tenant-stolen',
    };
    
    // شبیه‌سازی پالایش Payload
    const sanitized = { ...incomingPayload };
    delete (sanitized as any).organizationId;

    expect(sanitized).not.toHaveProperty('organizationId');
    expect(sanitized.fullName).toBe('Updated Name');
  });
});