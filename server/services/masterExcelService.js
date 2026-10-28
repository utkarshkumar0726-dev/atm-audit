const XLSX = require('xlsx');
const { Atm, Audit, Stage, ChecklistQuestion } = require('../models');

// Extract question code from questionText e.g. "[HW-01] ..." or fallback
function extractQuestionCode(text = '', fallback = '') {
  const match = text.match(/\[([A-Z0-9_-]+)\]/i);
  return match ? match[1].toUpperCase() : fallback;
}

// Clean text for Excel cells
function cleanCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  return String(val).replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * Generate Master Audit Excel Buffer
 */
async function generateMasterAuditExcelBuffer() {
  // 1. Fetch all ATMs sorted by Vendor and Serial No
  const atms = await Atm.find().populate('area', 'name').sort({ vendor: 1, slNo: 1 }).lean();

  // 2. Fetch all Audits with populated auditor
  const audits = await Audit.find().populate('auditor', 'name username email').lean();

  // Map latest / best audit per ATM ID (case-insensitive)
  const auditMap = new Map();
  for (const a of audits) {
    const key = (a.atmId || '').trim().toUpperCase();
    if (!key) continue;
    const existing = auditMap.get(key);
    if (!existing) {
      auditMap.set(key, a);
    } else {
      // Prioritize completed audit, or newer audit
      if (a.isCompleted && !existing.isCompleted) {
        auditMap.set(key, a);
      } else if (new Date(a.updatedAt || a.createdAt || 0) > new Date(existing.updatedAt || existing.createdAt || 0)) {
        auditMap.set(key, a);
      }
    }
  }

  // 3. Fetch canonical stages and checklist questions
  const stages = await Stage.find().sort({ order: 1 }).lean();
  const canonicalQuestions = [];
  for (const st of stages) {
    const questions = await ChecklistQuestion.find({ stage: st._id }).sort({ order: 1 }).lean();
    questions.forEach((q, idx) => {
      canonicalQuestions.push({
        stageId: st._id,
        stageName: st.name,
        questionId: q._id,
        code: q.code || extractQuestionCode(q.text, `Q${idx + 1}`),
        text: q.text,
      });
    });
  }

  // ==========================================
  // SHEET 1: Master Sites Audit Register & Observations
  // ==========================================
  const registerRows = [];

  // Title Block
  registerRows.push(['PUNJAB & SIND BANK - INTEGRATED e-SURVEILLANCE AUDIT']);
  registerRows.push(['MASTER SITE AUDIT REGISTER & COMPREHENSIVE OBSERVATIONS REPORT']);
  registerRows.push([
    `Report Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    '',
    `Total Site Scope: ${atms.length} ATMs`,
    '',
    `Audited Sites: ${auditMap.size} ATMs`,
    '',
    `Pending Sites: ${atms.length - auditMap.size} ATMs`,
  ]);
  registerRows.push([]); // blank separator

  // Table Headers
  const registerHeaders = [
    'Sr. No.',
    'ATM / CRM ID',
    'Vendor',
    'Branch Name',
    'Site Location / Address',
    'Zone / Area',
    'State',
    'Site Type',
    'BIC Code',
    'Branch In-charge',
    'In-charge Designation',
    'In-charge Contact',
    'Audit Status',
    'Date of Audit',
    'Lead Auditor',
    'Auditor Username',
    'Stage 1: Hardware Result',
    'Stage 2: Functional Result',
    'Stage 3: Network & Cyber Result',
    'Overall Compliance Result',
    'Compliance Score (%)',
    'Total Passed (YES)',
    'Total Failed (NO)',
    'Unanswered / Pending',
    'Total Checks Scope',
    'BOM Verification Status',
    'Photos Attached',
    'Consolidated Deficiencies & Auditor Observations',
  ];
  registerRows.push(registerHeaders);

  // Statistics accumulators for Sheet 4
  const stats = {
    totalSites: atms.length,
    auditedSites: 0,
    completedSites: 0,
    inProgressSites: 0,
    pendingSites: 0,
    vendorBreakdown: {},
    zoneBreakdown: {},
    commonDeficiencies: {},
  };

  // Populate Register Rows
  atms.forEach((atm, index) => {
    const key = (atm.atmId || '').trim().toUpperCase();
    const audit = auditMap.get(key);
    const vendorName = atm.vendor || 'Unknown';
    const zoneName = atm.area?.name || atm.zone || 'General';

    // Init stats for vendor & zone
    if (!stats.vendorBreakdown[vendorName]) {
      stats.vendorBreakdown[vendorName] = { total: 0, audited: 0, completed: 0, inProgress: 0, pending: 0 };
    }
    stats.vendorBreakdown[vendorName].total++;

    if (!stats.zoneBreakdown[zoneName]) {
      stats.zoneBreakdown[zoneName] = { total: 0, audited: 0, completed: 0 };
    }
    stats.zoneBreakdown[zoneName].total++;

    let auditStatus = 'Pending (Not Audited)';
    let auditDateStr = '-';
    let auditorName = '-';
    let auditorUsername = '-';
    let stage1Result = 'Pending';
    let stage2Result = 'Pending';
    let stage3Result = 'Pending';
    let overallResult = 'Not Audited';
    let complianceScoreStr = '0%';
    let passedCount = 0;
    let failedCount = 0;
    let pendingCount = canonicalQuestions.length || 37;
    let totalQuestionsCount = canonicalQuestions.length || 37;
    let bomStatusStr = 'Not Verified';
    let totalPhotos = 0;
    let deficienciesList = [];

    if (audit) {
      stats.auditedSites++;
      stats.vendorBreakdown[vendorName].audited++;
      stats.zoneBreakdown[zoneName].audited++;

      if (audit.isCompleted) {
        auditStatus = 'Completed (100%)';
        stats.completedSites++;
        stats.vendorBreakdown[vendorName].completed++;
        stats.zoneBreakdown[zoneName].completed++;
      } else {
        auditStatus = 'In Progress';
        stats.inProgressSites++;
        stats.vendorBreakdown[vendorName].inProgress++;
      }

      const dateObj = audit.completedAt || audit.updatedAt || audit.createdAt;
      auditDateStr = dateObj ? new Date(dateObj).toLocaleDateString('en-IN') : '-';
      auditorName = audit.auditor?.name || 'Assigned Auditor';
      auditorUsername = audit.auditor?.username ? `@${audit.auditor.username}` : '';

      // Analyze Stages
      const auditStages = audit.stages || [];
      const stageMap = {};
      auditStages.forEach((st, idx) => {
        const sName = (st.stageName || '').toLowerCase();
        let stageNum = idx + 1;
        if (sName.includes('hardware') || sName.includes('stage 1')) stageNum = 1;
        else if (sName.includes('functional') || sName.includes('stage 2')) stageNum = 2;
        else if (sName.includes('network') || sName.includes('cyber') || sName.includes('stage 3')) stageNum = 3;
        stageMap[stageNum] = st;
      });

      // Stage evaluation helper
      function evaluateStage(st) {
        if (!st || !Array.isArray(st.questions) || st.questions.length === 0) {
          return { text: 'Pending', passed: 0, failed: 0, total: 0 };
        }
        let stPassed = 0;
        let stFailed = 0;
        let stTotal = st.questions.length;
        st.questions.forEach((q) => {
          if (q.answer === 'yes') stPassed++;
          else if (q.answer === 'no') stFailed++;
        });
        let resultText = 'Compliant';
        if (stFailed > 0 && stPassed > 0) resultText = `Partially Compliant (${stFailed} Fail)`;
        else if (stFailed > 0 && stPassed === 0) resultText = `Non-Compliant (${stFailed} Fail)`;
        else if (stPassed === 0 && stFailed === 0) resultText = 'Pending';
        else resultText = `Compliant (${stPassed}/${stTotal})`;
        return { text: resultText, passed: stPassed, failed: stFailed, total: stTotal };
      }

      const s1Eval = evaluateStage(stageMap[1]);
      const s2Eval = evaluateStage(stageMap[2]);
      const s3Eval = evaluateStage(stageMap[3]);

      stage1Result = s1Eval.text;
      stage2Result = s2Eval.text;
      stage3Result = s3Eval.text;

      // Extract all questions across stages
      let totalAnswered = 0;
      auditStages.forEach((st) => {
        (st.questions || []).forEach((q) => {
          const qText = q.questionText || '';
          const qCode = extractQuestionCode(qText, 'CK');
          if (q.answer === 'yes') {
            passedCount++;
            totalAnswered++;
          } else if (q.answer === 'no') {
            failedCount++;
            totalAnswered++;
            const reason = (q.reason || 'No remarks specified').trim();
            deficienciesList.push(`[${qCode}] ${reason}`);

            // Track common deficiencies
            const defKey = `[${qCode}] ${qText.slice(0, 75)}`;
            stats.commonDeficiencies[defKey] = (stats.commonDeficiencies[defKey] || 0) + 1;
          }

          // Check BOM items on Q1
          if (Array.isArray(q.bomItems) && q.bomItems.length > 0) {
            const bomYes = q.bomItems.filter((b) => b.status === 'yes').length;
            const bomNo = q.bomItems.filter((b) => b.status === 'no').length;
            const bomTotal = q.bomItems.length;
            if (bomNo > 0) {
              bomStatusStr = `${bomYes}/${bomTotal} Installed (${bomNo} Missing)`;
            } else if (bomYes === bomTotal) {
              bomStatusStr = `${bomYes}/${bomTotal} Fully Installed`;
            } else {
              bomStatusStr = `${bomYes}/${bomTotal} Verified`;
            }
          }
        });
      });

      // Photos Count
      const atmPhotos = Array.isArray(audit.atm?.links) ? audit.atm.links.length : (audit.atm?.link ? 1 : 0);
      const inspectionPhotos = Array.isArray(audit.photos) ? audit.photos.length : 0;
      let questionPhotos = 0;
      auditStages.forEach((st) => {
        (st.questions || []).forEach((q) => {
          if (Array.isArray(q.photos)) questionPhotos += q.photos.length;
        });
      });
      totalPhotos = atmPhotos + inspectionPhotos + questionPhotos;

      // Compliance calculation
      if (totalAnswered > 0) {
        const pct = Math.round((passedCount / totalAnswered) * 100);
        complianceScoreStr = `${pct}%`;
        if (pct === 100) overallResult = 'Fully Compliant';
        else if (pct >= 85) overallResult = 'Substantially Compliant';
        else if (pct >= 60) overallResult = 'Partially Compliant';
        else overallResult = 'Non-Compliant';
      } else {
        complianceScoreStr = '0%';
        overallResult = 'Pending';
      }

      pendingCount = Math.max(0, totalQuestionsCount - totalAnswered);
    } else {
      stats.pendingSites++;
      stats.vendorBreakdown[vendorName].pending++;
      deficienciesList.push('Audit not conducted yet');
    }

    const row = [
      index + 1,
      cleanCell(atm.atmId),
      cleanCell(atm.vendor),
      cleanCell(atm.branchName),
      cleanCell(atm.address),
      cleanCell(zoneName),
      cleanCell(atm.state),
      cleanCell(atm.siteType || 'ONSITE'),
      cleanCell(atm.bic),
      cleanCell(atm.inchargeName),
      cleanCell(atm.inchargeDesig),
      cleanCell(atm.inchargeContact),
      cleanCell(auditStatus),
      cleanCell(auditDateStr),
      cleanCell(auditorName),
      cleanCell(auditorUsername),
      cleanCell(stage1Result),
      cleanCell(stage2Result),
      cleanCell(stage3Result),
      cleanCell(overallResult),
      cleanCell(complianceScoreStr),
      passedCount,
      failedCount,
      pendingCount,
      totalQuestionsCount,
      cleanCell(bomStatusStr),
      totalPhotos,
      cleanCell(deficienciesList.join(' | ')),
    ];

    registerRows.push(row);
  });

  // ==========================================
  // SHEET 2: Detailed Checkpoint Matrix (All 37 Questions)
  // ==========================================
  const matrixRows = [];
  matrixRows.push(['PUNJAB & SIND BANK - INTEGRATED e-SURVEILLANCE AUDIT']);
  matrixRows.push(['DETAILED CHECKPOINT COMPLIANCE MATRIX (ALL 37 REQUIREMENTS)']);
  matrixRows.push([
    `Legend: YES = Compliant | NO: [Reason] = Non-Compliant with Auditor Remark | PENDING = Unanswered`,
  ]);
  matrixRows.push([]);

  const matrixHeaders = [
    'Sr. No.',
    'ATM / CRM ID',
    'Vendor',
    'Branch Name',
    'Zone / Area',
    'State',
    'Audit Status',
    'Compliance %',
  ];

  canonicalQuestions.forEach((cq) => {
    matrixHeaders.push(`${cq.code}: ${cq.text.slice(0, 45)}...`);
  });

  matrixRows.push(matrixHeaders);

  atms.forEach((atm, index) => {
    const key = (atm.atmId || '').trim().toUpperCase();
    const audit = auditMap.get(key);
    const zoneName = atm.area?.name || atm.zone || 'General';

    // Map audit question answers by questionId or code/text
    const questionAnswerMap = new Map();
    if (audit) {
      (audit.stages || []).forEach((st) => {
        (st.questions || []).forEach((q) => {
          const qText = (q.questionText || '').trim();
          const qCode = extractQuestionCode(qText, '');
          const qId = q.questionId ? String(q.questionId) : '';

          let displayVal = 'PENDING';
          if (q.answer === 'yes') displayVal = 'YES';
          else if (q.answer === 'no') {
            displayVal = `NO: ${q.reason || 'Not Compliant'}`;
          }

          if (qId) questionAnswerMap.set(qId, displayVal);
          if (qCode) questionAnswerMap.set(qCode, displayVal);
          if (qText) questionAnswerMap.set(qText.toLowerCase(), displayVal);
        });
      });
    }

    let statusStr = audit ? (audit.isCompleted ? 'Completed' : 'In Progress') : 'Not Audited';
    let compliancePct = '-';
    if (audit) {
      let yes = 0;
      let no = 0;
      (audit.stages || []).forEach((st) => {
        (st.questions || []).forEach((q) => {
          if (q.answer === 'yes') yes++;
          else if (q.answer === 'no') no++;
        });
      });
      if (yes + no > 0) compliancePct = `${Math.round((yes / (yes + no)) * 100)}%`;
    }

    const row = [
      index + 1,
      cleanCell(atm.atmId),
      cleanCell(atm.vendor),
      cleanCell(atm.branchName),
      cleanCell(zoneName),
      cleanCell(atm.state),
      cleanCell(statusStr),
      cleanCell(compliancePct),
    ];

    // For each canonical question, look up answer
    canonicalQuestions.forEach((cq) => {
      if (!audit) {
        row.push('-');
        return;
      }
      let val =
        questionAnswerMap.get(String(cq.questionId)) ||
        questionAnswerMap.get(cq.code) ||
        questionAnswerMap.get(cq.text.trim().toLowerCase()) ||
        'PENDING';
      row.push(cleanCell(val));
    });

    matrixRows.push(row);
  });

  // ==========================================
  // SHEET 3: BOM Hardware Verification
  // ==========================================
  const bomRows = [];
  bomRows.push(['PUNJAB & SIND BANK - INTEGRATED e-SURVEILLANCE AUDIT']);
  bomRows.push(['BILL OF MATERIALS (BOM) HARDWARE COMPONENTS VERIFICATION REGISTER']);
  bomRows.push(['Audit Verification of 29 Mandatory E-Surveillance Hardware Items across Audited Sites']);
  bomRows.push([]);

  const bomHeaders = [
    'Sr. No.',
    'ATM ID',
    'Vendor',
    'Branch Name',
    'Zone / Area',
    'BOM Item #',
    'Component Name',
    'Make / Description',
    'Required Qty',
    'Installed & Healthy Status',
    'Auditor Observation / Remarks',
  ];
  bomRows.push(bomHeaders);

  let bomSrNo = 1;
  atms.forEach((atm) => {
    const key = (atm.atmId || '').trim().toUpperCase();
    const audit = auditMap.get(key);
    if (!audit) return; // Only audited sites have BOM verification data

    const zoneName = atm.area?.name || atm.zone || 'General';

    // Look for BOM items in Stage 1 Q1 or any question
    let foundBomItems = [];
    (audit.stages || []).forEach((st) => {
      (st.questions || []).forEach((q) => {
        if (Array.isArray(q.bomItems) && q.bomItems.length > 0) {
          foundBomItems = q.bomItems;
        }
      });
    });

    if (foundBomItems.length > 0) {
      foundBomItems.forEach((bItem, bIdx) => {
        const statusText = bItem.status === 'yes' ? 'INSTALLED & WORKING' : bItem.status === 'no' ? 'MISSING / FAULTY' : 'PENDING';
        bomRows.push([
          bomSrNo++,
          cleanCell(atm.atmId),
          cleanCell(atm.vendor),
          cleanCell(atm.branchName),
          cleanCell(zoneName),
          bItem.id || bIdx + 1,
          cleanCell(bItem.name),
          cleanCell(bItem.desc || ''),
          bItem.qty || 1,
          cleanCell(statusText),
          cleanCell(bItem.remark || (bItem.status === 'yes' ? 'Found installed as per BoM specification' : 'Not installed / non-functional')),
        ]);
      });
    }
  });

  // ==========================================
  // SHEET 4: Executive Summary & Analytics
  // ==========================================
  const summaryRows = [];
  summaryRows.push(['PUNJAB & SIND BANK - e-SURVEILLANCE AUDIT EXECUTIVE SUMMARY']);
  summaryRows.push([`Audit Scope: 101 ATMs/CRMs | Lead Auditor: INFOCUS-IT (CERT-In Empanelled)`]);
  summaryRows.push([]);

  summaryRows.push(['1. HIGH LEVEL AUDIT PROGRESS METRICS']);
  summaryRows.push(['Metric Description', 'Count / Value', 'Percentage of Total Scope']);
  summaryRows.push(['Total ATMs in Scope', stats.totalSites, '100%']);
  summaryRows.push([
    'Total Audits Conducted (Completed + In Progress)',
    stats.auditedSites,
    `${Math.round((stats.auditedSites / stats.totalSites) * 100)}%`,
  ]);
  summaryRows.push([
    'Audits 100% Completed (All 3 Stages)',
    stats.completedSites,
    `${Math.round((stats.completedSites / stats.totalSites) * 100)}%`,
  ]);
  summaryRows.push([
    'Audits In Progress',
    stats.inProgressSites,
    `${Math.round((stats.inProgressSites / stats.totalSites) * 100)}%`,
  ]);
  summaryRows.push([
    'Audits Pending (Not Started)',
    stats.pendingSites,
    `${Math.round((stats.pendingSites / stats.totalSites) * 100)}%`,
  ]);
  summaryRows.push([]);

  summaryRows.push(['2. VENDOR-WISE BREAKDOWN']);
  summaryRows.push(['Vendor Name', 'Total Sites Scope', 'Audited Sites', 'Completed Audits', 'In Progress', 'Pending']);
  Object.keys(stats.vendorBreakdown).forEach((v) => {
    const vd = stats.vendorBreakdown[v];
    summaryRows.push([v, vd.total, vd.audited, vd.completed, vd.inProgress, vd.pending]);
  });
  summaryRows.push([]);

  summaryRows.push(['3. ZONE-WISE AUDIT PROGRESS']);
  summaryRows.push(['Zone / Area Name', 'Total Sites', 'Audited Sites', 'Completed Sites', 'Progress %']);
  Object.keys(stats.zoneBreakdown).forEach((z) => {
    const zd = stats.zoneBreakdown[z];
    const pct = zd.total > 0 ? `${Math.round((zd.audited / zd.total) * 100)}%` : '0%';
    summaryRows.push([z, zd.total, zd.audited, zd.completed, pct]);
  });
  summaryRows.push([]);

  summaryRows.push(['4. TOP NON-COMPLIANCE DEFICIENCIES & ISSUES ACROSS SITES']);
  summaryRows.push(['Rank', 'Checklist Requirement / Defect Description', 'No. of Affected Sites']);
  const sortedDeficiencies = Object.entries(stats.commonDeficiencies).sort((a, b) => b[1] - a[1]);
  if (sortedDeficiencies.length === 0) {
    summaryRows.push(['-', 'No non-compliance observations recorded yet', 0]);
  } else {
    sortedDeficiencies.slice(0, 15).forEach(([issue, count], idx) => {
      summaryRows.push([idx + 1, issue, count]);
    });
  }

  // ==========================================
  // Assemble Workbook with XLSX
  // ==========================================
  const wb = XLSX.utils.book_new();

  // 1. Append Sheet 1
  const wsRegister = XLSX.utils.aoa_to_sheet(registerRows);
  wsRegister['!cols'] = [
    { wch: 8 },  // Sr. No
    { wch: 15 }, // ATM ID
    { wch: 12 }, // Vendor
    { wch: 28 }, // Branch Name
    { wch: 45 }, // Address
    { wch: 15 }, // Zone
    { wch: 14 }, // State
    { wch: 12 }, // Site Type
    { wch: 12 }, // BIC
    { wch: 22 }, // Incharge
    { wch: 24 }, // Desig
    { wch: 15 }, // Contact
    { wch: 18 }, // Status
    { wch: 14 }, // Date
    { wch: 20 }, // Auditor
    { wch: 16 }, // Username
    { wch: 24 }, // Stage 1
    { wch: 24 }, // Stage 2
    { wch: 24 }, // Stage 3
    { wch: 22 }, // Overall
    { wch: 16 }, // Compliance %
    { wch: 12 }, // Passed
    { wch: 12 }, // Failed
    { wch: 12 }, // Pending
    { wch: 12 }, // Scope
    { wch: 26 }, // BOM
    { wch: 14 }, // Photos
    { wch: 65 }, // Deficiencies
  ];
  XLSX.utils.book_append_sheet(wb, wsRegister, 'Site Audit Register');

  // 2. Append Sheet 2
  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  const matrixCols = [
    { wch: 8 },
    { wch: 15 },
    { wch: 12 },
    { wch: 26 },
    { wch: 15 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  canonicalQuestions.forEach(() => matrixCols.push({ wch: 25 }));
  wsMatrix['!cols'] = matrixCols;
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Checkpoints Matrix');

  // 3. Append Sheet 3
  const wsBom = XLSX.utils.aoa_to_sheet(bomRows);
  wsBom['!cols'] = [
    { wch: 8 },  // Sr
    { wch: 15 }, // ATM ID
    { wch: 12 }, // Vendor
    { wch: 26 }, // Branch
    { wch: 15 }, // Zone
    { wch: 10 }, // BOM ID
    { wch: 38 }, // Name
    { wch: 20 }, // Desc
    { wch: 12 }, // Qty
    { wch: 24 }, // Status
    { wch: 45 }, // Remark
  ];
  XLSX.utils.book_append_sheet(wb, wsBom, 'BOM Hardware Breakdown');

  // 4. Append Sheet 4
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  generateMasterAuditExcelBuffer,
};
