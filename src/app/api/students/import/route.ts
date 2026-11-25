import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireApiAuth, canEditStudentRecord } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { sanitizeText } from '@/lib/sanitize';
import { recalculateStudentRisk } from '@/lib/risk-service';
import { writeAuditLog } from '@/lib/audit';

const csvRowSchema = z.object({
  admissionNo: z.string().trim().min(2),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  gender: z.enum(['Female', 'Male', 'Other']).default('Female'),
  className: z.string().trim().min(1),
  wardVillage: z.string().trim().min(1),
  guardianName: z.string().trim().min(1),
  guardianPhone: z.string().trim().min(7),
  distanceKm: z.coerce.number().min(0).max(100).default(1),
  pendingFees: z.boolean().default(false),
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth([Role.TEACHER, Role.PRINCIPAL, Role.ADMIN]);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const csvText = typeof body.csv === 'string' ? body.csv : '';
    if (!csvText.trim()) {
      return NextResponse.json({ error: 'CSV text is required' }, { status: 400 });
    }

    const lines = csvText
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must contain a header row and at least one student row' },
        { status: 400 }
      );
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const classes = await prisma.class.findMany();
    const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c]));

    let imported = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const getCol = (name: string) => {
        const idx = headers.indexOf(name.toLowerCase());
        return idx >= 0 ? cols[idx] ?? '' : '';
      };

      const raw = {
        admissionNo: getCol('admissionNo') || getCol('admission_no'),
        firstName: getCol('firstName') || getCol('first_name'),
        lastName: getCol('lastName') || getCol('last_name'),
        gender: (getCol('gender') || 'Female') as 'Female' | 'Male' | 'Other',
        className: getCol('className') || getCol('class') || getCol('class_name'),
        wardVillage: getCol('wardVillage') || getCol('ward') || getCol('village'),
        guardianName: getCol('guardianName') || getCol('guardian_name'),
        guardianPhone: getCol('guardianPhone') || getCol('guardian_phone'),
        distanceKm: getCol('distanceKm') || getCol('distance_km') || '1',
        pendingFees: ['true', '1', 'yes'].includes(
          (getCol('pendingFees') || getCol('pending_fees')).toLowerCase()
        ),
      };

      const parsed = csvRowSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message || 'Invalid data'}`);
        continue;
      }

      const cls = classByName.get(parsed.data.className.toLowerCase());
      if (!cls) {
        errors.push(`Row ${i + 1}: Class "${parsed.data.className}" not found`);
        continue;
      }

      if (!canEditStudentRecord(user, { classTeacherId: cls.teacherId })) {
        errors.push(`Row ${i + 1}: Permission denied for class ${cls.name}`);
        continue;
      }

      try {
        const student = await prisma.student.upsert({
          where: { admissionNo: sanitizeText(parsed.data.admissionNo) },
          update: {
            firstName: sanitizeText(parsed.data.firstName),
            lastName: sanitizeText(parsed.data.lastName),
            gender: parsed.data.gender,
            classId: cls.id,
            wardVillage: sanitizeText(parsed.data.wardVillage),
            guardianName: sanitizeText(parsed.data.guardianName),
            guardianPhone: sanitizeText(parsed.data.guardianPhone),
            distanceKm: parsed.data.distanceKm,
            pendingFees: parsed.data.pendingFees,
          },
          create: {
            admissionNo: sanitizeText(parsed.data.admissionNo),
            firstName: sanitizeText(parsed.data.firstName),
            lastName: sanitizeText(parsed.data.lastName),
            gender: parsed.data.gender,
            classId: cls.id,
            wardVillage: sanitizeText(parsed.data.wardVillage),
            guardianName: sanitizeText(parsed.data.guardianName),
            guardianPhone: sanitizeText(parsed.data.guardianPhone),
            distanceKm: parsed.data.distanceKm,
            pendingFees: parsed.data.pendingFees,
          },
        });
        await recalculateStudentRisk(student.id);
        imported++;
      } catch {
        errors.push(`Row ${i + 1}: Failed to save student ${parsed.data.admissionNo}`);
      }
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'StudentImport',
      details: { imported, errorCount: errors.length },
    });

    return NextResponse.json({ imported, errors });
  } catch {
    return NextResponse.json({ error: 'Invalid CSV import request' }, { status: 400 });
  }
}
