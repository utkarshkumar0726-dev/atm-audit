import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';
import PhotoLightbox from '../components/PhotoLightbox';
import { printAuditReport, downloadSingleAuditCSV, downloadAuditsSummaryCSV } from '../utils/auditExport';

// Normalization function to handle spelling variants common in Delhi / Indian addresses
function normalizeLocalityQuery(str) {
  return (str || '')
    .toLowerCase()
    .replace(/rajender/g, 'rajendra')
    .replace(/palace/g, 'place')
    .replace(/karolbagh/g, 'karol bagh')
    .replace(/janak\s*puri/g, 'janakpuri')
    .replace(/tilak\s*nagar/g, 'tilak nagar')
    .replace(/patel\s*nagar/g, 'patel nagar')
    .replace(/rajouri\s*garden/g, 'rajouri garden')
    .replace(/connaught\s*place|cannaught|c\.?p\.?/g, 'connaught place')
    .replace(/chandni\s*chawk/g, 'chandni chowk')
    .replace(/kashmiri\s*gate/g, 'kashmere gate')
    .replace(/shalimar\s*bagh/g, 'shalimar bagh')
    .replace(/punjabi\s*bagh/g, 'punjabi bagh')
    .replace(/rani\s*bagh/g, 'rani bagh')
    .replace(/meera\s*bagh/g, 'meera bagh')
    .replace(/pahar\s*ganj/g, 'pahar ganj')
    .replace(/moti\s*nagar/g, 'moti nagar')
    .replace(/green\s*park/g, 'green park')
    .replace(/nehru\s*place/g, 'nehru place')
    .replace(/safdarjung/g, 'safdarjung')
    .replace(/gurgaon/g, 'gurugram')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Proximity & adjacent localities mapping for Delhi/NCR clusters
const DELHI_LOCALITY_PROXIMITY = {
  'karol bagh': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['rajendra place', 'patel nagar', 'pahar ganj', 'd.b.gupta', 'chandni chowk'],
    title: 'Karol Bagh & Central/West Delhi',
  },
  'rajender place': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['rajendra place', 'patel nagar', 'pahar ganj', 'karol bagh', 'tilak nagar'],
    title: 'Rajendra Place & Adjacent Areas',
  },
  'rajendra place': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['rajendra place', 'patel nagar', 'pahar ganj', 'karol bagh', 'tilak nagar'],
    title: 'Rajendra Place & Adjacent Areas',
  },
  'janakpuri': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['janakpuri', 'tilak nagar', 'mayapuri', 'vikaspuri', 'uttam nagar', 'dera santpura'],
    title: 'Janakpuri & West Delhi',
  },
  'rajouri garden': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['rajouri garden', 'tilak nagar', 'mayapuri', 'punjabi bagh', 'tagore garden', 'subhash nagar', 'west patel nagar'],
    title: 'Rajouri Garden & West Delhi',
  },
  'patel nagar': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['west patel nagar', 'rajendra place', 'pahar ganj', 'karol bagh'],
    title: 'Patel Nagar & Central/West Delhi',
  },
  'tilak nagar': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['tilak nagar', 'janakpuri', 'rajouri garden', 'mayapuri'],
    title: 'Tilak Nagar & West Delhi',
  },
  'chandni chowk': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['chandni chowk', 'fatehpuri', 'kashmere gate', 'asaf ali road'],
    title: 'Chandni Chowk & Old Delhi',
  },
  'connaught place': {
    targetArea: 'DELHI-I',
    adjacentKeywords: ['h block', 'connaught place', 'pahar ganj', 'ibd'],
    title: 'Connaught Place & Central Delhi',
  },
  'green park': {
    targetArea: 'DELHI-I',
    adjacentKeywords: ['green park', 'safdarjung', 'defence colony', 'hauz khas'],
    title: 'Green Park & South Delhi',
  },
  'mayapuri': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['mayapuri', 'naraina', 'rajouri garden', 'janakpuri'],
    title: 'Mayapuri & Naraina Area',
  },
  'punjabi bagh': {
    targetArea: 'DELHI-II',
    adjacentKeywords: ['punjabi bagh', 'rajouri garden', 'west patel nagar', 'peera garhi'],
    title: 'Punjabi Bagh & West Delhi',
  },
  'defence colony': {
    targetArea: 'DELHI-I',
    adjacentKeywords: ['defence colony', 'jangpura', 'green park', 'safdarjung'],
    title: 'Defence Colony & South Delhi',
  },
  'nehru place': {
    targetArea: 'DELHI-I',
    adjacentKeywords: ['nehru place', 'sarita vihar', 'okhla', 'hemkunt colony'],
    title: 'Nehru Place & South East Delhi',
  },
};

const POPULAR_LOCALITIES = [
  'Rajendra Place',
  'Karol Bagh',
  'Janakpuri',
  'Rajouri Garden',
  'Patel Nagar',
  'Tilak Nagar',
  'Connaught Place',
  'Chandni Chowk',
  'Green Park',
  'Mayapuri',
  'Punjabi Bagh',
];

function getStageStats(stage) {
  if (!stage || !Array.isArray(stage.questions)) return { answered: 0, total: 0, isComplete: false };
  const total = stage.questions.length;
  const answered = stage.questions.filter((q) => q.answer === 'yes' || q.answer === 'no').length;
  const isComplete =
    total > 0 &&
    stage.questions.every((q) => {
      if (q.answer === 'yes') return true;
      if (q.answer === 'no') return Boolean(q.reason?.trim());
      return false;
    });
  return { answered, total, isComplete };
}

function findStageByNumber(audit, stageNum) {
  if (!audit || !Array.isArray(audit.stages)) return null;
  return audit.stages.find((s, idx) => {
    const combined = `${s.stageName || ''} ${s.stageId || ''}`.toLowerCase();
    if (stageNum === 1) return idx === 0 || combined.includes('hardware') || combined.includes('stage 1');
    if (stageNum === 2) return idx === 1 || combined.includes('functional') || combined.includes('stage 2');
    if (stageNum === 3) return idx === 2 || combined.includes('network') || combined.includes('security') || combined.includes('stage 3');
    return false;
  });
}

function hasStageActivity(audit, stageNum) {
  const stage = findStageByNumber(audit, stageNum);
  if (!stage) return false;
  const stats = getStageStats(stage);
  const hasPhotos = (stage.questions || []).some((q) => q.photos && q.photos.length > 0);
  return stats.answered > 0 || hasPhotos;
}

function isAuditComplete(audit) {
  if (audit.isCompleted) return true;
  if (!audit || !Array.isArray(audit.stages) || audit.stages.length < 3) return false;
  return audit.stages.every((st) => {
    const stats = getStageStats(st);
    return stats.total > 0 && stats.isComplete;
  });
}

export default function AuditorAudits() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchScopeTab, setSearchScopeTab] = useState('all'); // 'all' | 'direct' | 'nearby'
  // 4 Submodules: 'all' | 'stage1' | 'stage2' | 'stage3' | 'completed'
  const [activeSubmodule, setActiveSubmodule] = useState('all');

  // Audit detail modal
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [detailAudit, setDetailAudit] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get('/audits/mine')
      .then((res) => {
        setAudits(res.data || []);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load submitted audits');
      })
      .finally(() => setLoading(false));
  }, []);

  function openAuditDetail(auditId) {
    setSelectedAuditId(auditId);
    setDetailError('');

    const local = audits.find((a) => String(a._id) === String(auditId));
    if (local) {
      setDetailAudit(local);
    }

    setLoadingDetail(true);
    api.get(`/audits/${auditId}`)
      .then((res) => {
        setDetailAudit(res.data);
      })
      .catch((err) => {
        console.error('Audit detail fetch error:', err);
        if (!local) {
          setDetailError(err.response?.data?.message || 'Failed to load audit details');
        }
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }

  function closeAuditDetail() {
    setSelectedAuditId(null);
    setDetailAudit(null);
    setDetailError('');
  }

  const [zoneFilter, setZoneFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'area'

  // Unique zones / areas with count for filter dropdown & chips
  const uniqueZones = useMemo(() => {
    const map = new Map();
    audits.forEach((a) => {
      const z = a.area || 'General';
      map.set(z, (map.get(z) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [audits]);

  // Smart locality & proximity search calculation for audits
  const searchResults = useMemo(() => {
    let list = audits;

    if (zoneFilter !== 'all') {
      list = list.filter((a) => (a.area || 'General') === zoneFilter);
    }

    const raw = search.trim();
    if (!raw) {
      return {
        isSearching: false,
        query: '',
        directMatches: list,
        nearbyMatches: [],
        matchedAreas: [],
        proximityTitle: '',
        displayedList: list,
      };
    }

    const nq = normalizeLocalityQuery(raw);
    const tokens = nq.split(' ').filter(Boolean);

    // 1. Direct matches
    const directMatches = [];
    list.forEach((a) => {
      const text = normalizeLocalityQuery(`${a.atmId} ${a.area}`);
      if (tokens.every((t) => text.includes(t))) {
        directMatches.push({ ...a, _searchMatchType: 'direct' });
      }
    });

    // 2. Proximity config
    let proximity = null;
    for (const [key, conf] of Object.entries(DELHI_LOCALITY_PROXIMITY)) {
      if (nq.includes(key) || key.includes(nq)) {
        proximity = conf;
        break;
      }
    }

    const directIds = new Set(directMatches.map((a) => String(a._id || a.id)));
    const targetAreas = new Set(directMatches.map((a) => a.area).filter(Boolean));
    if (proximity?.targetArea) {
      targetAreas.add(proximity.targetArea);
    }

    // 3. Nearby / same area audits
    const nearbyMatches = [];
    list.forEach((a) => {
      const id = String(a._id || a.id);
      if (directIds.has(id)) return;

      const aArea = a.area || 'General';
      const isSameArea = aArea && targetAreas.has(aArea);

      if (isSameArea) {
        nearbyMatches.push({
          ...a,
          _searchMatchType: 'nearby',
        });
      }
    });

    // Determine displayed list according to searchScopeTab
    let displayedList = [];
    if (searchScopeTab === 'direct') {
      displayedList = directMatches;
    } else if (searchScopeTab === 'nearby') {
      displayedList = nearbyMatches;
    } else {
      displayedList = [...directMatches, ...nearbyMatches];
    }

    return {
      isSearching: true,
      query: raw,
      directMatches,
      nearbyMatches,
      matchedAreas: Array.from(targetAreas),
      proximityTitle: proximity?.title || '',
      displayedList,
    };
  }, [audits, zoneFilter, search, searchScopeTab]);

  // Submodule counts
  const submoduleCounts = useMemo(() => {
    const stage1 = audits.filter((a) => hasStageActivity(a, 1)).length;
    const stage2 = audits.filter((a) => hasStageActivity(a, 2)).length;
    const stage3 = audits.filter((a) => hasStageActivity(a, 3)).length;
    const completed = audits.filter((a) => isAuditComplete(a)).length;
    return {
      all: audits.length,
      stage1,
      stage2,
      stage3,
      completed,
    };
  }, [audits]);

  // Filtered by Active Submodule
  const displayedAudits = useMemo(() => {
    let list = searchResults.displayedList;
    if (activeSubmodule === 'stage1') {
      list = list.filter((a) => hasStageActivity(a, 1));
    } else if (activeSubmodule === 'stage2') {
      list = list.filter((a) => hasStageActivity(a, 2));
    } else if (activeSubmodule === 'stage3') {
      list = list.filter((a) => hasStageActivity(a, 3));
    } else if (activeSubmodule === 'completed') {
      list = list.filter((a) => isAuditComplete(a));
    }
    return list;
  }, [searchResults.displayedList, activeSubmodule]);

  // Group displayed audits by Area
  const auditsByArea = useMemo(() => {
    const groups = new Map();
    displayedAudits.forEach((a) => {
      const areaName = a.area || 'General';
      if (!groups.has(areaName)) {
        groups.set(areaName, []);
      }
      groups.get(areaName).push(a);
    });
    return Array.from(groups.entries())
      .map(([areaName, list]) => ({
        areaName,
        audits: list,
        total: list.length,
      }))
      .sort((a, b) => a.areaName.localeCompare(b.areaName));
  }, [displayedAudits]);

  const stats = useMemo(() => {
    const totalSubmitted = audits.length;
    const totalPhotos = audits.reduce((sum, a) => sum + (a.photos?.length || 0), 0);
    const uniqueZonesCount = uniqueZones.length;
    return { totalSubmitted, totalPhotos, uniqueZones: uniqueZonesCount };
  }, [audits, uniqueZones]);

  function renderAuditsTable(list) {
    return (
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>ATM ID</th>
              <th>Area / Zone</th>
              <th>📦 Stage 1 (Hardware)</th>
              <th>🔄 Stage 2 (Functional)</th>
              <th>⚡ Stage 3 (Security)</th>
              <th>Audit Status</th>
              <th>Photos</th>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((audit) => {
              const s1 = findStageByNumber(audit, 1);
              const s2 = findStageByNumber(audit, 2);
              const s3 = findStageByNumber(audit, 3);
              const s1Stats = getStageStats(s1);
              const s2Stats = getStageStats(s2);
              const s3Stats = getStageStats(s3);
              const isComplete = isAuditComplete(audit);

              return (
                <tr key={audit._id}>
                  <td>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: 'var(--color-primary)',
                        background: 'rgba(37, 99, 235, 0.08)',
                        padding: '4px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {audit.atmId}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          background: '#f1f5f9',
                          color: '#334155',
                        }}
                      >
                        📍 {audit.area || 'General'}
                      </span>
                      {audit._searchMatchType === 'direct' && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 700,
                          }}
                        >
                          🎯 Match
                        </span>
                      )}
                      {audit._searchMatchType === 'nearby' && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#ede9fe',
                            color: '#6d28d9',
                            fontWeight: 600,
                          }}
                        >
                          📍 Nearby
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Stage 1 */}
                  <td>
                    {s1Stats.total > 0 ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: s1Stats.isComplete ? '#dcfce7' : s1Stats.answered > 0 ? '#eff6ff' : '#f1f5f9',
                          color: s1Stats.isComplete ? '#15803d' : s1Stats.answered > 0 ? '#1d4ed8' : '#64748b',
                          border: s1Stats.isComplete ? '1px solid #bbf7d0' : s1Stats.answered > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        }}
                      >
                        {s1Stats.isComplete ? '✅' : '⏳'} {s1Stats.answered}/{s1Stats.total}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Pending</span>
                    )}
                  </td>
                  {/* Stage 2 */}
                  <td>
                    {s2Stats.total > 0 ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: s2Stats.isComplete ? '#dcfce7' : s2Stats.answered > 0 ? '#eff6ff' : '#f1f5f9',
                          color: s2Stats.isComplete ? '#15803d' : s2Stats.answered > 0 ? '#1d4ed8' : '#64748b',
                          border: s2Stats.isComplete ? '1px solid #bbf7d0' : s2Stats.answered > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        }}
                      >
                        {s2Stats.isComplete ? '✅' : '⏳'} {s2Stats.answered}/{s2Stats.total}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Pending</span>
                    )}
                  </td>
                  {/* Stage 3 */}
                  <td>
                    {s3Stats.total > 0 ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: s3Stats.isComplete ? '#dcfce7' : s3Stats.answered > 0 ? '#eff6ff' : '#f1f5f9',
                          color: s3Stats.isComplete ? '#15803d' : s3Stats.answered > 0 ? '#1d4ed8' : '#64748b',
                          border: s3Stats.isComplete ? '1px solid #bbf7d0' : s3Stats.answered > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        }}
                      >
                        {s3Stats.isComplete ? '✅' : '⏳'} {s3Stats.answered}/{s3Stats.total}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Pending</span>
                    )}
                  </td>
                  {/* Complete Audit Status */}
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: isComplete ? '#dcfce7' : '#fef3c7',
                        color: isComplete ? '#15803d' : '#b45309',
                        border: isComplete ? '1px solid #bbf7d0' : '1px solid #fde68a',
                      }}
                    >
                      {isComplete ? '🎉 Complete Audit' : '⏳ In Progress'}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.85rem',
                        color: '#475569',
                      }}
                    >
                      📸 {audit.photos?.length || 0}
                    </span>
                  </td>
                  <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                    {new Date(audit.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openAuditDetail(audit._id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.82rem',
                          fontWeight: 500,
                          borderRadius: 6,
                          background: '#f8fafc',
                          color: 'var(--color-primary)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                      >
                        👁 View
                      </button>
                      <button
                        onClick={() => navigate(`/audit/new?atmId=${audit.atmId}&continue=true`)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          borderRadius: 6,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          cursor: 'pointer',
                        }}
                        title={isComplete ? "Edit or update this completed audit" : "Continue remaining stages"}
                      >
                        ✏️ {isComplete ? 'Edit' : 'Continue'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Auditor</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>

      <AuditorNav />

      <div className="card wide">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Submitted Audits</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Complete history and inspection reports of all ATM audits submitted by you.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/auditor')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: 8,
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              📍 View Assigned ATMs
            </button>
            <button
              onClick={() => navigate('/audit/new')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              ➕ Start New Audit
            </button>
          </div>
        </div>

        {/* 5 Submodules KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {/* All Audits */}
          <div
            onClick={() => setActiveSubmodule('all')}
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: activeSubmodule === 'all' ? '#0f172a' : '#f8fafc',
              color: activeSubmodule === 'all' ? '#ffffff' : 'inherit',
              border: activeSubmodule === 'all' ? '2px solid #0f172a' : '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: activeSubmodule === 'all' ? '#94a3b8' : '#64748b' }}>
              📊 All Audits
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>
              {submoduleCounts.all}
            </div>
            <div style={{ fontSize: '0.72rem', color: activeSubmodule === 'all' ? '#cbd5e1' : '#94a3b8', marginTop: 2 }}>
              Total inspections
            </div>
          </div>

          {/* Stage 1 */}
          <div
            onClick={() => setActiveSubmodule('stage1')}
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: activeSubmodule === 'stage1' ? '#2563eb' : '#eff6ff',
              color: activeSubmodule === 'stage1' ? '#ffffff' : '#1e40af',
              border: activeSubmodule === 'stage1' ? '2px solid #1d4ed8' : '1px solid #bfdbfe',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: activeSubmodule === 'stage1' ? '#dbeafe' : '#1d4ed8' }}>
              📦 Stage 1: Hardware
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>
              {submoduleCounts.stage1}
            </div>
            <div style={{ fontSize: '0.72rem', color: activeSubmodule === 'stage1' ? '#dbeafe' : '#3b82f6', marginTop: 2 }}>
              Hardware verified
            </div>
          </div>

          {/* Stage 2 */}
          <div
            onClick={() => setActiveSubmodule('stage2')}
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: activeSubmodule === 'stage2' ? '#0891b2' : '#ecfeff',
              color: activeSubmodule === 'stage2' ? '#ffffff' : '#155e75',
              border: activeSubmodule === 'stage2' ? '2px solid #0e7490' : '1px solid #a5f3fc',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: activeSubmodule === 'stage2' ? '#cffafe' : '#0891b2' }}>
              🔄 Stage 2: Functional
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>
              {submoduleCounts.stage2}
            </div>
            <div style={{ fontSize: '0.72rem', color: activeSubmodule === 'stage2' ? '#cffafe' : '#06b6d4', marginTop: 2 }}>
              Quality tested
            </div>
          </div>

          {/* Stage 3 */}
          <div
            onClick={() => setActiveSubmodule('stage3')}
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: activeSubmodule === 'stage3' ? '#7c3aed' : '#f5f3ff',
              color: activeSubmodule === 'stage3' ? '#ffffff' : '#5b21b6',
              border: activeSubmodule === 'stage3' ? '2px solid #6d28d9' : '1px solid #ddd6fe',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: activeSubmodule === 'stage3' ? '#ede9fe' : '#7c3aed' }}>
              ⚡ Stage 3: Security
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>
              {submoduleCounts.stage3}
            </div>
            <div style={{ fontSize: '0.72rem', color: activeSubmodule === 'stage3' ? '#ede9fe' : '#8b5cf6', marginTop: 2 }}>
              Network & cyber audit
            </div>
          </div>

          {/* Complete Audit */}
          <div
            onClick={() => setActiveSubmodule('completed')}
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: activeSubmodule === 'completed' ? '#16a34a' : '#f0fdf4',
              color: activeSubmodule === 'completed' ? '#ffffff' : '#14532d',
              border: activeSubmodule === 'completed' ? '2px solid #15803d' : '1px solid #bbf7d0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: activeSubmodule === 'completed' ? '#dcfce7' : '#16a34a' }}>
              🎉 Complete Audit
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>
              {submoduleCounts.completed}
            </div>
            <div style={{ fontSize: '0.72rem', color: activeSubmodule === 'completed' ? '#dcfce7' : '#22c55e', marginTop: 2 }}>
              All 3 stages 100% done
            </div>
          </div>
        </div>

        {/* 4 Submodules Tabs Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 20,
            borderBottom: '2px solid #f1f5f9',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubmodule('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              fontWeight: activeSubmodule === 'all' ? 700 : 500,
              background: activeSubmodule === 'all' ? '#1e293b' : '#f8fafc',
              color: activeSubmodule === 'all' ? '#ffffff' : '#475569',
              border: activeSubmodule === 'all' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>📊 All Audits</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: activeSubmodule === 'all' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                color: activeSubmodule === 'all' ? '#ffffff' : '#334155',
                fontWeight: 700,
              }}
            >
              {submoduleCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage1')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              fontWeight: activeSubmodule === 'stage1' ? 700 : 500,
              background: activeSubmodule === 'stage1' ? '#2563eb' : '#eff6ff',
              color: activeSubmodule === 'stage1' ? '#ffffff' : '#1d4ed8',
              border: activeSubmodule === 'stage1' ? '1px solid #1d4ed8' : '1px solid #bfdbfe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>📦 Stage 1: Hardware</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: activeSubmodule === 'stage1' ? 'rgba(255,255,255,0.25)' : '#dbeafe',
                color: activeSubmodule === 'stage1' ? '#ffffff' : '#1e40af',
                fontWeight: 700,
              }}
            >
              {submoduleCounts.stage1}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage2')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              fontWeight: activeSubmodule === 'stage2' ? 700 : 500,
              background: activeSubmodule === 'stage2' ? '#0891b2' : '#ecfeff',
              color: activeSubmodule === 'stage2' ? '#ffffff' : '#0e7490',
              border: activeSubmodule === 'stage2' ? '1px solid #0e7490' : '1px solid #a5f3fc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>🔄 Stage 2: Functional</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: activeSubmodule === 'stage2' ? 'rgba(255,255,255,0.25)' : '#cffafe',
                color: activeSubmodule === 'stage2' ? '#ffffff' : '#155e75',
                fontWeight: 700,
              }}
            >
              {submoduleCounts.stage2}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage3')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              fontWeight: activeSubmodule === 'stage3' ? 700 : 500,
              background: activeSubmodule === 'stage3' ? '#7c3aed' : '#f5f3ff',
              color: activeSubmodule === 'stage3' ? '#ffffff' : '#6d28d9',
              border: activeSubmodule === 'stage3' ? '1px solid #6d28d9' : '1px solid #ddd6fe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>⚡ Stage 3: Network & Security</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: activeSubmodule === 'stage3' ? 'rgba(255,255,255,0.25)' : '#ede9fe',
                color: activeSubmodule === 'stage3' ? '#ffffff' : '#5b21b6',
                fontWeight: 700,
              }}
            >
              {submoduleCounts.stage3}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('completed')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.86rem',
              fontWeight: activeSubmodule === 'completed' ? 700 : 500,
              background: activeSubmodule === 'completed' ? '#16a34a' : '#f0fdf4',
              color: activeSubmodule === 'completed' ? '#ffffff' : '#15803d',
              border: activeSubmodule === 'completed' ? '1px solid #15803d' : '1px solid #bbf7d0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>🎉 Complete Audit (All 3 Stages)</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 7px',
                borderRadius: 12,
                background: activeSubmodule === 'completed' ? 'rgba(255,255,255,0.25)' : '#dcfce7',
                color: activeSubmodule === 'completed' ? '#ffffff' : '#166534',
                fontWeight: 700,
              }}
            >
              {submoduleCounts.completed}
            </span>
          </button>
        </div>

        {/* Search, Area Filter & View Mode Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: uniqueZones.length > 1 ? 12 : 20,
          }}
        >
          <input
            type="text"
            placeholder="🔍 Search submitted audits by ATM ID or Area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: '0.95rem',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => downloadAuditsSummaryCSV(displayedAudits, `My_Audits_${activeSubmodule}`)}
              disabled={displayedAudits.length === 0}
              title="Download your audits summary as CSV spreadsheet"
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: displayedAudits.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📥 Export Audits CSV
            </button>
            {uniqueZones.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>📍 Area / Zone:</span>
                <select
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: zoneFilter !== 'all' ? '1.5px solid #7c3aed' : '1px solid var(--color-border)',
                    fontSize: '0.86rem',
                    background: zoneFilter !== 'all' ? '#f5f3ff' : '#ffffff',
                    color: zoneFilter !== 'all' ? '#6d28d9' : '#1e293b',
                    fontWeight: zoneFilter !== 'all' ? 700 : 400,
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Areas ({audits.length})</option>
                  {uniqueZones.map((z) => (
                    <option key={z.name} value={z.name}>
                      {z.name} ({z.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* View Mode Switcher */}
            <div
              style={{
                display: 'inline-flex',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: '#f1f5f9',
                padding: 3,
                gap: 3,
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'table' ? 700 : 500,
                  background: viewMode === 'table' ? '#ffffff' : 'transparent',
                  color: viewMode === 'table' ? '#1e293b' : '#64748b',
                  border: viewMode === 'table' ? '1px solid #cbd5e1' : 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📄</span> Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('area')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'area' ? 700 : 500,
                  background: viewMode === 'area' ? '#7c3aed' : 'transparent',
                  color: viewMode === 'area' ? '#ffffff' : '#64748b',
                  border: viewMode === 'area' ? '1px solid #6d28d9' : 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'area' ? '0 1px 3px rgba(124, 58, 237, 0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📂</span> Area-Wise View ({uniqueZones.length})
              </button>
            </div>
          </div>
        </div>

        {/* Quick Area Filter Chips */}
        {uniqueZones.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 20,
              padding: '10px 14px',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>📍</span> Quick Area Filter:
            </span>
            <button
              type="button"
              onClick={() => setZoneFilter('all')}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: '0.8rem',
                fontWeight: zoneFilter === 'all' ? 700 : 500,
                background: zoneFilter === 'all' ? '#2563eb' : '#ffffff',
                color: zoneFilter === 'all' ? '#ffffff' : '#475569',
                border: zoneFilter === 'all' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              All Areas ({audits.length})
            </button>
            {uniqueZones.map((z) => {
              const isSelected = zoneFilter === z.name;
              return (
                <button
                  key={z.name}
                  type="button"
                  onClick={() => setZoneFilter(isSelected ? 'all' : z.name)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? '#7c3aed' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#475569',
                    border: isSelected ? '1px solid #6d28d9' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 1px 3px rgba(124, 58, 237, 0.25)' : 'none',
                  }}
                >
                  {z.name} ({z.count})
                </button>
              );
            })}
            {zoneFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setZoneFilter('all')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  cursor: 'pointer',
                  marginLeft: 4,
                }}
              >
                ✕ Reset Area
              </button>
            )}
          </div>
        )}

        {/* Popular Delhi Localities Quick Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 16,
            padding: '8px 12px',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🏙️</span> Popular Localities:
          </span>
          {POPULAR_LOCALITIES.map((loc) => {
            const isSelected = search.trim().toLowerCase() === loc.toLowerCase();
            return (
              <button
                key={loc}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSearch('');
                    setSearchScopeTab('all');
                  } else {
                    setSearch(loc);
                    setSearchScopeTab('all');
                  }
                }}
                style={{
                  padding: '3px 9px',
                  borderRadius: 16,
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? '#1e1b4b' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  border: isSelected ? '1px solid #1e1b4b' : '1px solid #cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {loc}
              </button>
            );
          })}
        </div>

        {/* Active Locality Search Intelligence Banner */}
        {searchResults.isSearching && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #f0fdf4 0%, #f5f3ff 100%)',
              border: '1px solid #c7d2fe',
              marginBottom: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔍</span>
                <span>Locality Search: "{searchResults.query}"</span>
                {searchResults.proximityTitle && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6d28d9' }}>
                    ({searchResults.proximityTitle})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 3 }}>
                {searchResults.directMatches.length > 0 ? (
                  <>
                    Found <strong style={{ color: '#16a34a' }}>{searchResults.directMatches.length} audit(s)</strong> matching this locality
                    {searchResults.nearbyMatches.length > 0 && (
                      <> + <strong style={{ color: '#7c3aed' }}>{searchResults.nearbyMatches.length} nearby audits</strong> in {searchResults.matchedAreas.join(', ')}</>
                    )}
                  </>
                ) : searchResults.nearbyMatches.length > 0 ? (
                  <>
                    No direct audit match, but found <strong style={{ color: '#7c3aed' }}>{searchResults.nearbyMatches.length} nearby audits around this locality</strong> in {searchResults.matchedAreas.join(', ')}.
                  </>
                ) : (
                  <span>No audits found matching this locality.</span>
                )}
              </div>
            </div>

            {/* Scope tabs */}
            {(searchResults.directMatches.length > 0 || searchResults.nearbyMatches.length > 0) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setSearchScopeTab('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.78rem',
                    fontWeight: searchScopeTab === 'all' ? 700 : 500,
                    background: searchScopeTab === 'all' ? '#1e1b4b' : '#ffffff',
                    color: searchScopeTab === 'all' ? '#ffffff' : '#334155',
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  All ({searchResults.directMatches.length + searchResults.nearbyMatches.length})
                </button>

                {searchResults.directMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchScopeTab('direct')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: '0.78rem',
                      fontWeight: searchScopeTab === 'direct' ? 700 : 500,
                      background: searchScopeTab === 'direct' ? '#16a34a' : '#ffffff',
                      color: searchScopeTab === 'direct' ? '#ffffff' : '#15803d',
                      border: '1px solid #86efac',
                      cursor: 'pointer',
                    }}
                  >
                    🎯 Direct Matches ({searchResults.directMatches.length})
                  </button>
                )}

                {searchResults.nearbyMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchScopeTab('nearby')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: '0.78rem',
                      fontWeight: searchScopeTab === 'nearby' ? 700 : 500,
                      background: searchScopeTab === 'nearby' ? '#7c3aed' : '#ffffff',
                      color: searchScopeTab === 'nearby' ? '#ffffff' : '#6d28d9',
                      border: '1px solid #c4b5fd',
                      cursor: 'pointer',
                    }}
                  >
                    📍 Nearby in Same Area ({searchResults.nearbyMatches.length})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSearchScopeTab('all');
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 14,
                    fontSize: '0.75rem',
                    color: '#dc2626',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    cursor: 'pointer',
                  }}
                >
                  ✕ Clear
                </button>
              </div>
            )}
          </div>
        )}

        {loading && (
          <p style={{ color: 'var(--color-text-muted)', padding: '24px 0' }}>
            Loading your submitted audits...
          </p>
        )}
        {error && <p className="error">{error}</p>}

        {!loading && audits.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px dashed var(--color-border)',
              margin: '20px 0',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>No Audits Submitted Yet</h3>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 20px', fontSize: '0.95rem' }}>
              You haven't conducted any audits yet. Start inspecting your assigned ATMs today!
            </p>
            <button
              onClick={() => navigate('/auditor')}
              style={{ padding: '10px 24px', fontSize: '0.95rem', borderRadius: 8 }}
            >
              📍 Go to Assigned ATMs
            </button>
          </div>
        )}

        {!loading && audits.length > 0 && displayedAudits.length === 0 && (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px dashed #cbd5e1',
              margin: '20px 0',
            }}
          >
            <p style={{ color: '#64748b', fontSize: '0.95rem', margin: '0 0 12px' }}>
              {search
                ? `No audits match your search "${search}" in the selected submodule filter.`
                : activeSubmodule !== 'all'
                ? `No audits currently in ${
                    activeSubmodule === 'stage1'
                      ? 'Stage 1 (Hardware Verification)'
                      : activeSubmodule === 'stage2'
                      ? 'Stage 2 (Functional & Quality)'
                      : activeSubmodule === 'stage3'
                      ? 'Stage 3 (Network & Security)'
                      : 'Complete Audit (All 3 Stages)'
                  }.`
                : 'No audits match the selected filter.'}
            </p>
            {activeSubmodule !== 'all' && (
              <button
                type="button"
                onClick={() => setActiveSubmodule('all')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  background: '#1e293b',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                View All Audits ({audits.length})
              </button>
            )}
          </div>
        )}

        {!loading && displayedAudits.length > 0 && (
          viewMode === 'area' ? (
            /* Area-Wise Grouped Audits View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {auditsByArea.map((group) => (
                <div
                  key={group.areaName}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>📍</span> Area: {group.areaName}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#e0e7ff',
                          color: '#4338ca',
                        }}
                      >
                        {group.total} {group.total === 1 ? 'Audit' : 'Audits'}
                      </span>
                    </h3>
                  </div>
                  {renderAuditsTable(group.audits)}
                </div>
              ))}
            </div>
          ) : (
            /* Flat Table View */
            renderAuditsTable(displayedAudits)
          )
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedAuditId && (
        <div
          className="modal-backdrop"
          onClick={closeAuditDetail}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 720 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 16,
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                  Audit Details: {detailAudit?.atmId || 'Loading...'}
                </h2>
                {detailAudit && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      Zone: <strong>{detailAudit.area}</strong> &bull; Submitted:{' '}
                      {new Date(detailAudit.createdAt).toLocaleString()}
                    </p>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: detailAudit.stages?.length >= 3 ? '#dcfce7' : '#eff6ff',
                        color: detailAudit.stages?.length >= 3 ? '#15803d' : '#1d4ed8',
                        border: detailAudit.stages?.length >= 3 ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                      }}
                    >
                      {detailAudit.stages?.length >= 3
                        ? '✅ Full Audit (3/3 Stages)'
                        : `📦 Partial Audit (${detailAudit.stages?.length || 0}/3 Stages)`}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {detailAudit && (
                  <>
                    <button
                      type="button"
                      onClick={() => printAuditReport(detailAudit)}
                      title="Download or Print PDF Inspection Report"
                      style={{
                        padding: '7px 12px',
                        borderRadius: 6,
                        background: '#1e3a8a',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      📄 PDF Report
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleAuditCSV(detailAudit)}
                      title="Download Checklist as CSV Spreadsheet"
                      style={{
                        padding: '7px 12px',
                        borderRadius: 6,
                        background: '#f0fdf4',
                        color: '#15803d',
                        border: '1px solid #bbf7d0',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      📊 CSV
                    </button>
                  </>
                )}
                <button
                  onClick={closeAuditDetail}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    fontSize: '1.25rem',
                    borderRadius: '50%',
                    width: 36,
                    height: 36,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {loadingDetail && <p style={{ padding: '20px 0', textAlign: 'center' }}>Loading audit details...</p>}
            {detailError && <p className="error">{detailError}</p>}

            {detailAudit && !loadingDetail && (
              <div>
                {/* Captured Photos Gallery */}
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>ATM Overview Photos</h3>
                {detailAudit.photos?.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    {detailAudit.photos.map((p, i) => (
                      <div
                        key={i}
                        onClick={() => setLightboxPhoto(p)}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        <img
                          src={p}
                          alt={`ATM photo ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>
                    No photos recorded.
                  </p>
                )}

                {/* Stages & Checklist Responses */}
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>Checklist Inspection Results</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {detailAudit.stages?.map((stage, sIdx) => {
                    const questions = stage.questions || stage.responses || [];
                    return (
                      <div
                        key={sIdx}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--color-border)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: '#1e293b',
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          {stage.stageName} {questions.length > 0 ? `(${questions.length} items)` : ''}
                        </div>
                        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {questions.length === 0 ? (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
                              No responses recorded for this section.
                            </p>
                          ) : (
                            questions.map((q, qIdx) => {
                              const qText = q.questionText || q.text || `Question ${qIdx + 1}`;
                              const ans = (q.answer || 'na').toLowerCase();
                              return (
                                <div
                                  key={qIdx}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                    paddingBottom: 10,
                                    borderBottom:
                                      qIdx < questions.length - 1 ? '1px dashed #f1f5f9' : 'none',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ fontSize: '0.9rem', color: '#334155' }}>
                                      {qText}
                                    </span>
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        background: ans === 'yes' ? '#dcfce7' : ans === 'no' ? '#fee2e2' : '#f1f5f9',
                                        color: ans === 'yes' ? '#15803d' : ans === 'no' ? '#b91c1c' : '#64748b',
                                        alignSelf: 'flex-start',
                                      }}
                                    >
                                      {ans}
                                    </span>
                                  </div>
                                  {ans === 'no' && q.reason && (
                                    <div
                                      style={{
                                        fontSize: '0.85rem',
                                        color: '#dc2626',
                                        background: '#fef2f2',
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                      }}
                                    >
                                      <strong>Reason:</strong> {q.reason}
                                    </div>
                                  )}
                                  {q.photos?.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                      {q.photos.map((qp, qpi) => (
                                        <img
                                          key={qpi}
                                          src={qp}
                                          alt="Question issue photo"
                                          onClick={() => setLightboxPhoto(qp)}
                                          style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 6,
                                            objectFit: 'cover',
                                            cursor: 'pointer',
                                            border: '1px solid var(--color-border)',
                                          }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {detailAudit.stages?.length < 3 && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: '12px 16px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      color: '#475569',
                      fontSize: '0.86rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <span>
                      ℹ️ <strong>Remaining Stages Pending:</strong> Only {detailAudit.stages?.length || 0} of 3 stages have been submitted for this ATM.
                    </span>
                    <button
                      onClick={() => {
                        closeAuditDetail();
                        navigate(`/audit/new?atmId=${detailAudit.atmId}&continue=true`);
                      }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        borderRadius: 6,
                        background: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      ➕ Continue Next Stages &rarr;
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    onClick={() => {
                      closeAuditDetail();
                      navigate(`/audit/new?atmId=${detailAudit.atmId}&continue=true`);
                    }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>✏️</span> Edit / Update This Audit
                  </button>
                  <button
                    onClick={closeAuditDetail}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      background: '#f1f5f9',
                      border: '1px solid var(--color-border)',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox for zooming photos */}
      {lightboxPhoto && (
        <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </div>
  );
}
