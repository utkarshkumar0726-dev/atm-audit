// Utility for exporting and downloading ATM Audit reports (PDF / CSV / Excel format)

function sanitizeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function triggerDownload(content, filename, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Extract all ATM master photos and auditor inspection photos
export function extractAuditPhotos(audit) {
  const atmPhotos = Array.from(
    new Set(
      [
        ...(audit?.atm?.links || []),
        audit?.atm?.link,
      ].filter((p) => p && typeof p === 'string' && p.trim().length > 0)
    )
  );

  const inspectionPhotos = Array.isArray(audit?.photos)
    ? audit.photos.filter((p) => p && typeof p === 'string' && p.trim().length > 0)
    : [];

  const questionPhotos = [];
  (audit?.stages || []).forEach((st) => {
    (st.questions || []).forEach((q, qIdx) => {
      if (Array.isArray(q.photos) && q.photos.length > 0) {
        q.photos.forEach((ph, pIdx) => {
          if (ph && typeof ph === 'string' && ph.trim().length > 0) {
            questionPhotos.push({
              photo: ph,
              stageName: st.stageName || 'Checklist Stage',
              questionNum: qIdx + 1,
              questionText: q.questionText || '',
              answer: q.answer || '',
              reason: q.reason || '',
              photoIndex: pIdx + 1,
            });
          }
        });
      }
    });
  });

  return { atmPhotos, inspectionPhotos, questionPhotos };
}

// 1. Export Detailed Single Audit Report as CSV
export function downloadSingleAuditCSV(audit) {
  if (!audit) return;

  const atmId = audit.atmId || 'UNKNOWN';
  const auditorName = audit.auditor?.name || audit.auditor || 'Unknown';
  const auditorUser = audit.auditor?.username || '';
  const dateStr = audit.completedAt || audit.createdAt || new Date().toISOString();
  const formattedDate = new Date(dateStr).toLocaleString();
  const statusStr = audit.isCompleted ? 'COMPLETED (100%)' : `IN PROGRESS (${audit.stages?.length || 0}/3 Stages)`;

  const { atmPhotos, inspectionPhotos, questionPhotos } = extractAuditPhotos(audit);
  const totalPhotos = atmPhotos.length + inspectionPhotos.length + questionPhotos.length;

  const lines = [];

  // Header Section
  lines.push('================================================================================');
  lines.push(`PUNJAB & SIND BANK - ATM e-SURVEILLANCE & SECURITY AUDIT REPORT`);
  lines.push('================================================================================');
  lines.push(`ATM ID,${sanitizeCSV(atmId)}`);
  lines.push(`Branch Name,${sanitizeCSV(audit.atm?.branchName || audit.atm?.location || '')}`);
  lines.push(`Area / Zone,${sanitizeCSV(audit.area || audit.atm?.area?.name || 'General')}`);
  lines.push(`Site Address,${sanitizeCSV(audit.atm?.address || '')}`);
  lines.push(`Bank Identifier Code (BIC),${sanitizeCSV(audit.atm?.bic || '')}`);
  lines.push(`Device ID,${sanitizeCSV(audit.atm?.deviceId || '')}`);
  lines.push(`Auditor Name,${sanitizeCSV(auditorName)}`);
  lines.push(`Auditor Username,${sanitizeCSV(auditorUser)}`);
  lines.push(`Audit Status,${sanitizeCSV(statusStr)}`);
  lines.push(`Inspection Date / Time,${sanitizeCSV(formattedDate)}`);
  lines.push(`ATM Master Photos Count,${atmPhotos.length}`);
  lines.push(`Auditor Inspection Photos Count,${inspectionPhotos.length}`);
  lines.push(`Checklist Question Photos Count,${questionPhotos.length}`);
  lines.push(`Total Photos Attached,${totalPhotos}`);
  lines.push('');

  // ATM Photos Links Section
  if (atmPhotos.length > 0) {
    lines.push('--------------------------------------------------------------------------------');
    lines.push('ATM OFFICIAL SITE / INSTALLATION REPORT PHOTOS');
    lines.push('--------------------------------------------------------------------------------');
    lines.push('Photo #,Image URL / Reference');
    atmPhotos.forEach((link, idx) => {
      lines.push(`${idx + 1},${sanitizeCSV(link)}`);
    });
    lines.push('');
  }

  // Stages Summary
  lines.push('--------------------------------------------------------------------------------');
  lines.push('STAGE-WISE SUMMARY');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('Stage Name,Total Questions,Answered Questions,Passed (YES),Failed (NO),Evidence Photos Attached');

  (audit.stages || []).forEach((st) => {
    const qList = st.questions || [];
    const totalQ = qList.length;
    const answered = qList.filter((q) => q.answer === 'yes' || q.answer === 'no').length;
    const passed = qList.filter((q) => q.answer === 'yes').length;
    const failed = qList.filter((q) => q.answer === 'no').length;
    const photosCount = qList.reduce((acc, q) => acc + (q.photos?.length || 0), 0);
    lines.push(
      [
        sanitizeCSV(st.stageName || 'Stage'),
        totalQ,
        answered,
        passed,
        failed,
        photosCount,
      ].join(',')
    );
  });
  lines.push('');

  // Detailed Checklist Table
  lines.push('--------------------------------------------------------------------------------');
  lines.push('DETAILED CHECKLIST INSPECTION RESPONSES');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('Stage,Question #,Checklist Question,Answer / Compliance,Reason / Non-Compliance Remarks,Photos Count');

  (audit.stages || []).forEach((st) => {
    const stageName = st.stageName || 'Stage';
    (st.questions || []).forEach((q, idx) => {
      const qNum = idx + 1;
      const ans = q.answer ? q.answer.toUpperCase() : 'UNANSWERED (PENDING)';
      const reason = q.reason || '';
      const photoCount = q.photos?.length || 0;
      lines.push(
        [
          sanitizeCSV(stageName),
          qNum,
          sanitizeCSV(q.questionText || ''),
          sanitizeCSV(ans),
          sanitizeCSV(reason),
          photoCount,
        ].join(',')
      );
    });
  });

  const csvString = '\uFEFF' + lines.join('\r\n');
  const filename = `ATM_Audit_Report_${atmId}_${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(csvString, filename);
}

// 2. Export Summary of All / Filtered Audits as CSV
export function downloadAuditsSummaryCSV(audits, submoduleTitle = 'All_Audits') {
  if (!Array.isArray(audits) || audits.length === 0) return;

  const headers = [
    'SL NO',
    'ATM ID',
    'BRANCH NAME',
    'AREA / ZONE',
    'AUDITOR NAME',
    'AUDITOR USERNAME',
    'STATUS',
    'STAGE 1 (HARDWARE)',
    'STAGE 2 (FUNCTIONAL)',
    'STAGE 3 (SECURITY)',
    'TOTAL ANSWERED',
    'IS COMPLETED',
    'SUBMITTED DATE',
    'LAST UPDATED',
  ];

  function getStageAnsweredCount(stage) {
    if (!stage || !Array.isArray(stage.questions)) return { answered: 0, total: 0 };
    const total = stage.questions.length;
    const answered = stage.questions.filter((q) => q.answer === 'yes' || q.answer === 'no').length;
    return { answered, total };
  }

  function findStage(audit, num) {
    if (!audit || !Array.isArray(audit.stages)) return null;
    return audit.stages.find((s, idx) => {
      const c = `${s.stageName || ''} ${s.stageId || ''}`.toLowerCase();
      if (num === 1) return idx === 0 || c.includes('hardware');
      if (num === 2) return idx === 1 || c.includes('functional');
      if (num === 3) return idx === 2 || c.includes('network') || c.includes('security');
      return false;
    });
  }

  const rows = audits.map((a, index) => {
    const s1 = getStageAnsweredCount(findStage(a, 1));
    const s2 = getStageAnsweredCount(findStage(a, 2));
    const s3 = getStageAnsweredCount(findStage(a, 3));
    const totalAns = s1.answered + s2.answered + s3.answered;
    const isDone = a.isCompleted ? 'YES (100%)' : 'NO (In Progress)';

    return [
      index + 1,
      sanitizeCSV(a.atmId || ''),
      sanitizeCSV(a.atm?.branchName || a.branchName || a.atm?.location || a.location || ''),
      sanitizeCSV(a.area || a.atm?.area?.name || 'General'),
      sanitizeCSV(a.auditor?.name || a.auditor || 'Unknown'),
      sanitizeCSV(a.auditor?.username || ''),
      sanitizeCSV(a.isCompleted ? 'Completed' : 'In Progress'),
      sanitizeCSV(`${s1.answered}/${s1.total || 10}`),
      sanitizeCSV(`${s2.answered}/${s2.total || 15}`),
      sanitizeCSV(`${s3.answered}/${s3.total || 12}`),
      sanitizeCSV(`${totalAns}/37`),
      sanitizeCSV(isDone),
      sanitizeCSV(a.createdAt ? new Date(a.createdAt).toLocaleString() : ''),
      sanitizeCSV(a.updatedAt ? new Date(a.updatedAt).toLocaleString() : ''),
    ].join(',');
  });

  const csvString = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const cleanTitle = submoduleTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `ATM_Audits_Summary_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(csvString, filename);
}

// 3. Print / Save as PDF Professional Audit Report with ATM Photos Included
export function printAuditReport(audit) {
  if (!audit) return;

  const atmId = audit.atmId || 'UNKNOWN';
  const branchName = audit.atm?.branchName || audit.atm?.location || '';
  const address = audit.atm?.address || '';
  const bic = audit.atm?.bic || '';
  const deviceId = audit.atm?.deviceId || '';
  const auditorName = audit.auditor?.name || audit.auditor || 'Unknown Auditor';
  const auditorUsername = audit.auditor?.username ? `@${audit.auditor.username}` : '';
  const dateStr = audit.completedAt || audit.createdAt || new Date().toISOString();
  const formattedDate = new Date(dateStr).toLocaleString();
  const area = audit.area || audit.atm?.area?.name || 'General';
  const isCompleted = Boolean(audit.isCompleted);

  // Extract all photos
  const { atmPhotos, inspectionPhotos, questionPhotos } = extractAuditPhotos(audit);

  // Compute stage statistics
  const stages = audit.stages || [];
  let totalQuestionsCount = 0;
  let totalAnsweredCount = 0;
  let totalPassedCount = 0;
  let totalFailedCount = 0;

  stages.forEach((st) => {
    (st.questions || []).forEach((q) => {
      totalQuestionsCount++;
      if (q.answer === 'yes') {
        totalAnsweredCount++;
        totalPassedCount++;
      } else if (q.answer === 'no') {
        totalAnsweredCount++;
        totalFailedCount++;
      }
    });
  });

  const printWindow = window.open('', '_blank', 'width=1000,height=950');
  if (!printWindow) {
    alert('Please allow pop-ups in your browser to download or print the PDF audit report.');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ATM Audit Report - ${atmId}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      font-size: 10.5pt;
      line-height: 1.45;
    }
    .header-bar {
      border-bottom: 3px solid #1e3a8a;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .bank-title {
      font-size: 18pt;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.02em;
      margin: 0;
      text-transform: uppercase;
    }
    .report-subtitle {
      font-size: 10pt;
      color: #475569;
      font-weight: 600;
      margin: 3px 0 0;
    }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-completed {
      background-color: #dcfce7 !important;
      color: #15803d !important;
      border: 1px solid #86efac;
    }
    .badge-inprogress {
      background-color: #fef3c7 !important;
      color: #b45309 !important;
      border: 1px solid #fde68a;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 7.5pt;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .meta-val {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
      word-break: break-word;
    }
    .stats-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .stat-box {
      flex: 1;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .stat-box-val {
      font-size: 13pt;
      font-weight: 800;
      color: #1e3a8a;
    }
    .stat-box-lbl {
      font-size: 7.5pt;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
    }

    /* Photos Section */
    .photo-section-block {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 11pt;
      font-weight: 800;
      color: #1e293b;
      background: #f1f5f9;
      padding: 7px 12px;
      border-left: 4px solid #1e3a8a;
      margin: 0 0 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .photo-grid-layout {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .photo-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .photo-card img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      display: block;
      background: #f1f5f9;
    }
    .photo-card-caption {
      padding: 6px 8px;
      font-size: 8pt;
      color: #475569;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      line-height: 1.35;
    }

    /* Stage Tables */
    .stage-section {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 8.8pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 9px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f8fafc;
      font-weight: 700;
      color: #334155;
    }
    .ans-yes {
      color: #16a34a;
      font-weight: 800;
      display: inline-block;
      padding: 2px 6px;
      background: #f0fdf4;
      border-radius: 4px;
      border: 1px solid #bbf7d0;
    }
    .ans-no {
      color: #dc2626;
      font-weight: 800;
      display: inline-block;
      padding: 2px 6px;
      background: #fef2f2;
      border-radius: 4px;
      border: 1px solid #fecaca;
    }
    .ans-pending {
      color: #d97706;
      font-style: italic;
    }
    .reason-box {
      margin-top: 4px;
      font-size: 8pt;
      color: #991b1b;
      background: #fff1f2;
      padding: 4px 6px;
      border-radius: 4px;
      border-left: 3px solid #ef4444;
    }
    .table-photo-thumb {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      display: inline-block;
      margin: 2px 4px 2px 0;
    }

    /* Sign-off */
    .signoff-section {
      margin-top: 30px;
      padding-top: 16px;
      border-top: 2px dashed #94a3b8;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .signoff-box {
      width: 45%;
    }
    .sign-line {
      margin-top: 36px;
      border-bottom: 1px solid #0f172a;
      width: 200px;
    }

    .no-print {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .btn-print {
      background: #1e3a8a;
      color: #ffffff;
      padding: 10px 22px;
      border-radius: 6px;
      border: none;
      font-weight: 700;
      font-size: 11pt;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(30, 58, 138, 0.25);
    }
    .btn-close {
      background: #f1f5f9;
      color: #475569;
      padding: 10px 18px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      font-weight: 600;
      font-size: 11pt;
      cursor: pointer;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        padding: 0 !important;
      }
      .photo-grid-layout {
        grid-template-columns: repeat(3, 1fr) !important;
      }
      .photo-card img {
        height: 160px !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <span style="font-size: 10pt; color: #64748b; margin-right: auto;">
      💡 Tip: Photos will automatically load. Choose "Save as PDF" in the print destination to save the report file.
    </span>
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
  </div>

  <div class="header-bar">
    <div>
      <h1 class="bank-title">PUNJAB & SIND BANK</h1>
      <div class="report-subtitle">e-Surveillance & Security Audit Inspection Report</div>
    </div>
    <div>
      <span class="badge ${isCompleted ? 'badge-completed' : 'badge-inprogress'}">
        ${isCompleted ? '✓ Completed Audit' : '⏳ Partial Audit'}
      </span>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-label">ATM Terminal ID</span>
      <span class="meta-val">${atmId}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Branch / Location</span>
      <span class="meta-val">${branchName || 'Not Specified'}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Area / Zone</span>
      <span class="meta-val">${area}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Auditor</span>
      <span class="meta-val">${auditorName} ${auditorUsername}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Audit Date & Time</span>
      <span class="meta-val">${formattedDate}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Site Address</span>
      <span class="meta-val">${address || 'On-site'}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Bank BIC Code</span>
      <span class="meta-val">${bic || 'N/A'}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Unit / Device ID</span>
      <span class="meta-val">${deviceId || 'N/A'}</span>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-box">
      <div class="stat-box-val">${totalQuestionsCount}</div>
      <div class="stat-box-lbl">Total Questions</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-val" style="color: #16a34a;">${totalPassedCount}</div>
      <div class="stat-box-lbl">Passed (YES)</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-val" style="color: #dc2626;">${totalFailedCount}</div>
      <div class="stat-box-lbl">Failed (NO)</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-val" style="color: #d97706;">${totalQuestionsCount - totalAnsweredCount}</div>
      <div class="stat-box-lbl">Unanswered</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-val" style="color: #2563eb;">${atmPhotos.length + inspectionPhotos.length + questionPhotos.length}</div>
      <div class="stat-box-lbl">Total Photos</div>
    </div>
  </div>

  <!-- 1. OFFICIAL ATM SITE & INSTALLATION PHOTOS -->
  ${
    atmPhotos.length > 0
      ? `
  <div class="photo-section-block">
    <div class="section-title">
      <span>🏧 Official ATM Site / Installation Report Photos (${atmPhotos.length})</span>
      <span style="font-size: 8pt; color: #64748b; font-weight: normal;">Archived from Bank Installation Records</span>
    </div>
    <div class="photo-grid-layout">
      ${atmPhotos
        .map(
          (url, idx) => `
        <div class="photo-card">
          <img src="${url}" alt="ATM Photo ${idx + 1}" crossorigin="anonymous" />
          <div class="photo-card-caption">
            <strong>ATM Photo #${idx + 1}</strong> &bull; Terminal: ${atmId}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

  <!-- 2. AUDITOR CAPTURED SITE INSPECTION PHOTOS -->
  ${
    inspectionPhotos.length > 0
      ? `
  <div class="photo-section-block">
    <div class="section-title">
      <span>📷 Auditor On-Site Inspection Photos (${inspectionPhotos.length})</span>
      <span style="font-size: 8pt; color: #64748b; font-weight: normal;">Captured during physical audit</span>
    </div>
    <div class="photo-grid-layout">
      ${inspectionPhotos
        .map(
          (p, idx) => `
        <div class="photo-card">
          <img src="${p}" alt="Audit Inspection Photo ${idx + 1}" />
          <div class="photo-card-caption">
            <strong>Inspection Photo #${idx + 1}</strong> &bull; Taken by ${auditorName}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

  <!-- 3. CHECKLIST QUESTION EVIDENCE PHOTOS -->
  ${
    questionPhotos.length > 0
      ? `
  <div class="photo-section-block">
    <div class="section-title">
      <span>📸 Checklist Question Evidence & Non-Compliance Photos (${questionPhotos.length})</span>
      <span style="font-size: 8pt; color: #64748b; font-weight: normal;">Attached to specific checklist answers</span>
    </div>
    <div class="photo-grid-layout">
      ${questionPhotos
        .map(
          (item) => `
        <div class="photo-card">
          <img src="${item.photo}" alt="Evidence Q#${item.questionNum}" />
          <div class="photo-card-caption">
            <strong>${item.stageName} - Q#${item.questionNum}</strong><br/>
            Status: <strong style="color: ${item.answer === 'yes' ? '#16a34a' : '#dc2626'}">${item.answer ? item.answer.toUpperCase() : 'N/A'}</strong>
            ${item.reason ? `<br/><span style="color: #991b1b;">Reason: ${item.reason}</span>` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

  <!-- 4. DETAILED STAGE CHECKLIST RESPONSES -->
  ${stages
    .map((st, sIdx) => {
      const qList = st.questions || [];
      const stTotal = qList.length;
      const stAns = qList.filter((q) => q.answer === 'yes' || q.answer === 'no').length;

      return `
    <div class="stage-section">
      <div class="section-title">
        <span>${st.stageName || `Stage ${sIdx + 1}`}</span>
        <span style="font-size: 8pt; color: #64748b; font-weight: normal;">
          Progress: ${stAns}/${stTotal} Answered
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 32px;">#</th>
            <th>Inspection Checklist Requirement</th>
            <th style="width: 85px; text-align: center;">Status</th>
            <th style="width: 220px;">Remarks / Photo Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${qList
            .map((q, qIdx) => {
              const ansClass =
                q.answer === 'yes'
                  ? 'ans-yes'
                  : q.answer === 'no'
                  ? 'ans-no'
                  : 'ans-pending';
              const ansText = q.answer ? q.answer.toUpperCase() : 'PENDING';

              const photosHtml =
                q.photos?.length > 0
                  ? `<div style="margin-top: 4px;">${q.photos
                      .map(
                        (p) => `<img src="${p}" class="table-photo-thumb" alt="Evidence" />`
                      )
                      .join('')}</div>`
                  : '';

              const reasonHtml =
                q.answer === 'no' && q.reason
                  ? `<div class="reason-box"><strong>Reason:</strong> ${q.reason}</div>`
                  : '';

              return `
              <tr>
                <td>${qIdx + 1}</td>
                <td>${q.questionText || ''}</td>
                <td style="text-align: center;">
                  <span class="${ansClass}">${ansText}</span>
                </td>
                <td>
                  ${reasonHtml}
                  ${photosHtml}
                </td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    `;
    })
    .join('')}

  <div class="signoff-section">
    <div class="signoff-box">
      <div style="font-size: 8pt; color: #64748b; line-height: 1.4;">
        I hereby verify that the e-surveillance and ATM equipment audit was conducted on-site in adherence to bank security norms.
      </div>
      <div class="sign-line"></div>
      <div style="font-size: 9pt; font-weight: 700; margin-top: 4px;">${auditorName}</div>
      <div style="font-size: 7.5pt; color: #64748b;">Auditor Signature & Date</div>
    </div>
    <div class="signoff-box" style="text-align: right;">
      <div style="font-size: 8pt; color: #64748b; line-height: 1.4;">
        Verified & Acknowledged by Bank Operations / Security In-Charge.
      </div>
      <div class="sign-line" style="margin-left: auto;"></div>
      <div style="font-size: 9pt; font-weight: 700; margin-top: 4px;">Bank / Branch Official</div>
      <div style="font-size: 7.5pt; color: #64748b;">Seal & Signature</div>
    </div>
  </div>

  <script>
    function ensureAllImagesLoadedAndPrint() {
      var imgs = Array.from(document.querySelectorAll('img'));
      if (imgs.length === 0) {
        setTimeout(function() { window.print(); }, 300);
        return;
      }
      var count = 0;
      var total = imgs.length;
      function checkDone() {
        count++;
        if (count >= total) {
          setTimeout(function() { window.print(); }, 400);
        }
      }
      imgs.forEach(function(img) {
        if (img.complete && img.naturalHeight !== 0) {
          checkDone();
        } else {
          img.addEventListener('load', checkDone);
          img.addEventListener('error', checkDone);
        }
      });
      // Safety timeout: fire print within 2.5 seconds regardless
      setTimeout(function() {
        window.print();
      }, 2500);
    }
    window.addEventListener('load', ensureAllImagesLoadedAndPrint);
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
