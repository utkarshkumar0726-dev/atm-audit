import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';
import PhotoLightbox from '../components/PhotoLightbox';

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

export default function AuditorAudits() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchScopeTab, setSearchScopeTab] = useState('all'); // 'all' | 'direct' | 'nearby'

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

  const filteredAudits = searchResults.displayedList;

  // Group filtered audits by Area
  const auditsByArea = useMemo(() => {
    const groups = new Map();
    filteredAudits.forEach((a) => {
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
  }, [filteredAudits]);

  const stats = useMemo(() => {
    const totalSubmitted = audits.length;
    const totalPhotos = audits.reduce((sum, a) => sum + (a.photos?.length || 0), 0);
    const uniqueZonesCount = uniqueZones.length;
    return { totalSubmitted, totalPhotos, uniqueZones: uniqueZonesCount };
  }, [audits, uniqueZones]);

  function renderAuditsTable(list) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>ATM ID</th>
              <th>Area / Zone</th>
              <th>Submitted Date & Time</th>
              <th>Photos</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((audit) => (
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
                <td style={{ color: '#475569', fontSize: '0.9rem' }}>
                  {new Date(audit.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
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
                    📸 {audit.photos?.length || 0} photo(s)
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => openAuditDetail(audit._id)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      borderRadius: 6,
                      background: '#f8fafc',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                    }}
                  >
                    👁 View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          {user?.name} <span className="role-badge">Auditor</span>
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

          <div style={{ display: 'flex', gap: 10 }}>
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

        {/* KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.02))',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>
              ✅ Audits Submitted
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {stats.totalSubmitted}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Total inspections completed
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(2, 132, 199, 0.02))',
              border: '1px solid rgba(2, 132, 199, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
              📸 Photos Uploaded
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
              {stats.totalPhotos}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Across all inspections
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.02))',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              📍 Zones Covered
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed', marginTop: 4 }}>
              {stats.uniqueZones}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Unique areas audited
            </div>
          </div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

        {!loading && audits.length > 0 && filteredAudits.length === 0 && (
          <p className="empty-state">No audits match your search query "{search}".</p>
        )}

        {!loading && filteredAudits.length > 0 && (
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
            renderAuditsTable(filteredAudits)
          )
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedAuditId && (
        <div
          className="modal-backdrop"
          onClick={closeAuditDetail}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              margin: 'auto',
            }}
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
                  <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Zone: <strong>{detailAudit.area}</strong> &bull; Submitted:{' '}
                    {new Date(detailAudit.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
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

                <div style={{ marginTop: 24, textAlign: 'right' }}>
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
