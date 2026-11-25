import {
  AttendanceStatus,
  CaseStage,
  DropoutReason,
  FollowUpType,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { calculateRiskScore, computeAttendanceMetrics, DEFAULT_RISK_RULES } from '../src/lib/risk';

const prisma = new PrismaClient();

const FIRST_NAMES_F = [
  'Aaradhya', 'Ananya', 'Bhavya', 'Chaitra', 'Deepika', 'Divya', 'Gowri', 'Harini',
  'Ishani', 'Kavya', 'Keerthi', 'Lakshmi', 'Meera', 'Nandini', 'Pavithra', 'Priya',
  'Rachana', 'Roshni', 'Sahana', 'Shreya', 'Sneha', 'Spoorthi', 'Swathi', 'Tanvi',
  'Vaishnavi', 'Varsha', 'Vidya', 'Yamini', 'Zoya', 'Nethra',
];

const FIRST_NAMES_M = [
  'Aarav', 'Aditya', 'Akash', 'Arjun', 'Chetan', 'Darshan', 'Gaurav', 'Harsha',
  'Karthik', 'Kiran', 'Manoj', 'Nikhil', 'Pranav', 'Rahul', 'Rohan', 'Sagar',
  'Sanjay', 'Shashank', 'Siddharth', 'Surya', 'Tejas', 'Varun', 'Vikram', 'Vinay',
  'Vivek', 'Yash', 'Nitin', 'Pavan', 'Rakesh', 'Tarun',
];

const LAST_NAMES = [
  'Gowda', 'Rao', 'Naik', 'Sharma', 'Patil', 'Kulkarni', 'Reddy', 'Shetty',
  'Bhat', 'Hegde', 'Joshi', 'Desai', 'Nair', 'Verma', 'Das',
];

const WARDS = [
  'Ward 1 - Jakkur',
  'Ward 2 - Yelahanka',
  'Ward 3 - Hebbal',
  'Ward 4 - Malleswaram',
  'Ward 5 - Peenya',
  'Ward 6 - Devanahalli',
];

async function main() {
  console.log('Seeding StayInSchool database...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  await prisma.riskRuleSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@stayinschool.org' },
    update: {},
    create: {
      name: 'Rajeshwari Admin',
      email: 'admin@stayinschool.org',
      passwordHash,
      role: Role.ADMIN,
      phone: '+919800000001',
      preferredLang: 'en',
    },
  });

  const principal = await prisma.user.upsert({
    where: { email: 'principal@stayinschool.org' },
    update: {},
    create: {
      name: 'Dr. Venkat Rao',
      email: 'principal@stayinschool.org',
      passwordHash,
      role: Role.PRINCIPAL,
      phone: '+919800000002',
      preferredLang: 'en',
    },
  });

  const teacher1 = await prisma.user.upsert({
    where: { email: 'ananya@stayinschool.org' },
    update: {},
    create: {
      name: 'Ananya Deshmukh',
      email: 'ananya@stayinschool.org',
      passwordHash,
      role: Role.TEACHER,
      phone: '+919800000011',
      preferredLang: 'kn',
    },
  });

  const teacher2 = await prisma.user.upsert({
    where: { email: 'ramesh@stayinschool.org' },
    update: {},
    create: {
      name: 'Ramesh Gowda',
      email: 'ramesh@stayinschool.org',
      passwordHash,
      role: Role.TEACHER,
      phone: '+919800000012',
      preferredLang: 'en',
    },
  });

  const teacher3 = await prisma.user.upsert({
    where: { email: 'lakshmi@stayinschool.org' },
    update: {},
    create: {
      name: 'Lakshmi Nair',
      email: 'lakshmi@stayinschool.org',
      passwordHash,
      role: Role.TEACHER,
      phone: '+919800000013',
      preferredLang: 'hi',
    },
  });

  const guardian = await prisma.user.upsert({
    where: { email: 'guardian@stayinschool.org' },
    update: {},
    create: {
      name: 'Suresh Gowda',
      email: 'guardian@stayinschool.org',
      passwordHash,
      role: Role.GUARDIAN,
      phone: '+919845011101',
      preferredLang: 'kn',
    },
  });

  const classSpecs = [
    { name: 'Class 6A', grade: 6, section: 'A', teacherId: teacher1.id },
    { name: 'Class 7B', grade: 7, section: 'B', teacherId: teacher2.id },
    { name: 'Class 8A', grade: 8, section: 'A', teacherId: teacher3.id },
  ];

  const classes = [];
  for (const spec of classSpecs) {
    const cls = await prisma.class.upsert({
      where: { name: spec.name },
      update: { teacherId: spec.teacherId },
      create: spec,
    });
    classes.push(cls);
  }

  // Clear existing sample students for idempotent re-seed
  await prisma.student.deleteMany({});

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Build 90 school-day dates backwards
  const dates: Date[] = [];
  for (let d = 89; d >= 0; d--) {
    const dt = new Date(today);
    dt.setUTCDate(today.getUTCDate() - d);
    dates.push(dt);
  }

  const createdStudents = [];

  for (let i = 0; i < 60; i++) {
    const isFemale = i % 2 === 0;
    const firstName = isFemale
      ? FIRST_NAMES_F[Math.floor(i / 2) % FIRST_NAMES_F.length]
      : FIRST_NAMES_M[Math.floor(i / 2) % FIRST_NAMES_M.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const cls = classes[i % 3];
    const ward = WARDS[i % WARDS.length];
    const admissionNo = `SIS-${1001 + i}`;

    // Deterministic risk archetypes across 60 students:
    // 0..8 -> High risk (9 students)
    // 9..22 -> Medium risk (14 students)
    // 23..54 -> Low risk (32 students)
    // 55..57 -> Re-enrolled success cases (3 students)
    // 58..59 -> Dropped out cases (2 students)
    const isHighProfile = i <= 8;
    const isMediumProfile = i >= 9 && i <= 22;
    const isReEnrolled = i >= 55 && i <= 57;
    const isDroppedOut = i >= 58;

    const pendingFees = isHighProfile || i % 5 === 0;
    const distanceKm = isHighProfile || i % 4 === 0 ? 4.2 : 1.4;
    const flagMigration = isHighProfile && i % 3 === 0;
    const flagHealth = (isHighProfile || isMediumProfile) && i % 4 === 1;
    const flagChildLabour = isHighProfile && i % 4 === 2;
    const flagEarlyMarriage = isHighProfile && isFemale && i % 5 === 3;

    const dropoutReason: DropoutReason | null = isDroppedOut
      ? i === 58
        ? DropoutReason.MIGRATION
        : DropoutReason.FEES
      : isReEnrolled
        ? DropoutReason.FEES
        : isHighProfile
          ? DropoutReason.WORK
          : null;

    const supportGiven = isReEnrolled
      ? 'Pre-Matric Scholarship + Free Bicycle approved'
      : isHighProfile
        ? 'Home visit scheduled & mid-day meal enrolment'
        : null;

    const student = await prisma.student.create({
      data: {
        admissionNo,
        firstName,
        lastName,
        gender: isFemale ? 'Female' : 'Male',
        classId: cls.id,
        wardVillage: ward,
        guardianName: i === 0 ? 'Suresh Gowda' : `${lastName} Guardian ${i + 1}`,
        guardianPhone: `+91984501${String(1000 + i).slice(-4)}`,
        guardianUserId: i === 0 ? guardian.id : null,
        pendingFees,
        distanceKm,
        flagMigration,
        flagHealth,
        flagChildLabour,
        flagEarlyMarriage,
        isDroppedOut,
        reEnrolled: isReEnrolled,
        reEnrolledAt: isReEnrolled ? new Date(today.getTime() - 10 * 86400000) : null,
        dropoutReason,
        supportGiven,
      },
    });

    // Generate 90 days of attendance
    const attRows: Array<{
      studentId: string;
      date: Date;
      status: AttendanceStatus;
      markedById: string;
    }> = [];

    for (let dayIdx = 0; dayIdx < dates.length; dayIdx++) {
      let status: AttendanceStatus = AttendanceStatus.PRESENT;
      if (isHighProfile || isDroppedOut) {
        // Frequent absences + 5-7 consecutive recent absences
        if (dayIdx >= dates.length - 6) {
          status = AttendanceStatus.ABSENT;
        } else if ((dayIdx + i) % 3 === 0) {
          status = AttendanceStatus.ABSENT;
        } else if ((dayIdx + i) % 7 === 0) {
          status = AttendanceStatus.LATE;
        }
      } else if (isMediumProfile) {
        if (dayIdx >= dates.length - 3 && i % 2 === 0) {
          status = AttendanceStatus.ABSENT;
        } else if ((dayIdx + i) % 4 === 0) {
          status = AttendanceStatus.ABSENT;
        }
      } else if (isReEnrolled) {
        // Absent earlier, present recently
        if (dayIdx < 35 && dayIdx % 2 === 0) {
          status = AttendanceStatus.ABSENT;
        }
      } else {
        if ((dayIdx + i) % 16 === 0) {
          status = AttendanceStatus.ABSENT;
        } else if ((dayIdx + i) % 19 === 0) {
          status = AttendanceStatus.LATE;
        }
      }

      attRows.push({
        studentId: student.id,
        date: dates[dayIdx],
        status,
        markedById: cls.teacherId!,
      });
    }

    await prisma.attendance.createMany({ data: attRows });

    // Marks
    const baseMark = isHighProfile ? 30 : isMediumProfile ? 48 : 76;
    await prisma.mark.createMany({
      data: [
        {
          studentId: student.id,
          subject: 'Mathematics',
          examName: 'Mid-Term',
          score: Math.min(98, baseMark + (i % 12)),
          maxScore: 100,
        },
        {
          studentId: student.id,
          subject: 'Science',
          examName: 'Mid-Term',
          score: Math.min(98, baseMark + ((i * 3) % 10)),
          maxScore: 100,
        },
      ],
    });

    const metrics = computeAttendanceMetrics(
      attRows.map((a) => ({ date: a.date, status: a.status }))
    );
    const avgMarks = isHighProfile ? 32 : isMediumProfile ? 52 : 78;
    const risk = calculateRiskScore(
      {
        attendanceRate: metrics.attendanceRate,
        consecutiveAbsences: metrics.consecutiveAbsences,
        averageMarks: avgMarks,
        pendingFees,
        distanceKm,
        flagMigration,
        flagHealth,
        flagChildLabour,
        flagEarlyMarriage,
      },
      DEFAULT_RISK_RULES
    );

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: {
        attendanceRate: metrics.attendanceRate,
        consecutiveAbsences: metrics.consecutiveAbsences,
        averageMarks: avgMarks,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons as unknown as Prisma.InputJsonValue,
      },
    });

    createdStudents.push({ student: updated, cls });
  }

  // Create sample cases across all 5 stages
  const caseConfigs = [
    { idx: 0, stage: CaseStage.FLAGGED, stale: true },
    { idx: 1, stage: CaseStage.FLAGGED, stale: false },
    { idx: 2, stage: CaseStage.CONTACTED, stale: false },
    { idx: 3, stage: CaseStage.CONTACTED, stale: false },
    { idx: 4, stage: CaseStage.HOME_VISIT, stale: false },
    { idx: 5, stage: CaseStage.HOME_VISIT, stale: false },
    { idx: 55, stage: CaseStage.RESOLVED, stale: false },
    { idx: 56, stage: CaseStage.RESOLVED, stale: false },
    { idx: 58, stage: CaseStage.DROPPED_OUT, stale: false },
    { idx: 59, stage: CaseStage.DROPPED_OUT, stale: false },
  ];

  for (const cfg of caseConfigs) {
    const target = createdStudents[cfg.idx];
    const lastAction = cfg.stale
      ? new Date(today.getTime() - 9 * 86400000)
      : new Date(today.getTime() - 2 * 86400000);

    const c = await prisma.case.create({
      data: {
        studentId: target.student.id,
        stage: cfg.stage,
        assignedToId: target.cls.teacherId,
        escalatedToPrincipal: cfg.stale,
        escalatedAt: cfg.stale ? today : null,
        lastActionAt: lastAction,
        resolvedAt: cfg.stage === CaseStage.RESOLVED ? today : null,
        dropoutReason: target.student.dropoutReason,
        supportGiven: target.student.supportGiven,
        notes: 'Seeded intervention case',
      },
    });

    await prisma.followUp.create({
      data: {
        caseId: c.id,
        studentId: target.student.id,
        authorId: target.cls.teacherId,
        type: cfg.stage === CaseStage.HOME_VISIT ? FollowUpType.HOME_VISIT : FollowUpType.CALL,
        outcome:
          cfg.stage === CaseStage.RESOLVED
            ? 'Student returned to class regularly'
            : 'Spoke with family regarding attendance support',
        notes: 'Discussed mid-day meal and scholarship support options with guardian.',
        nextFollowUpDate:
          cfg.stage === CaseStage.RESOLVED || cfg.stage === CaseStage.DROPPED_OUT
            ? null
            : new Date(today.getTime() + 2 * 86400000),
      },
    });
  }

  // Guardian portal initial message thread on Student 0
  await prisma.guardianMessage.createMany({
    data: [
      {
        studentId: createdStudents[0].student.id,
        senderId: teacher1.id,
        senderRole: Role.TEACHER,
        channel: 'PORTAL',
        body: 'Namaste Suresh ji, Aaradhya has missed school this week. Please let us know how we can help.',
      },
      {
        studentId: createdStudents[0].student.id,
        senderId: guardian.id,
        senderRole: Role.GUARDIAN,
        channel: 'PORTAL',
        body: 'Thank you teacher. She had mild fever and will return on Monday.',
      },
    ],
  });

  await prisma.notification.create({
    data: {
      userId: principal.id,
      studentId: createdStudents[0].student.id,
      type: 'ESCALATION',
      title: `Escalated case: ${createdStudents[0].student.firstName} ${createdStudents[0].student.lastName}`,
      message: 'Case flagged for 9 days without logged follow-up resolution.',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      userEmail: admin.email,
      userRole: Role.ADMIN,
      action: 'CREATE',
      entityType: 'Seed',
      details: { studentsSeeded: createdStudents.length },
    },
  });

  console.log('Seed completed: 60 students, 3 classes, 6 users, 90 days attendance.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
