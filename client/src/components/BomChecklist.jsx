import { useState, useMemo } from 'react';
import { BOM_ITEMS, createDefaultBomItems, getBomSummary } from '../utils/bomData';

export default function BomChecklist({
  items,
  onChange,
  onSyncMainAnswer,
  readOnly = false,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'no' | 'yes'

  const bomItems = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) {
      // Ensure all 33 items are represented
      return createDefaultBomItems(items);
    }
    return createDefaultBomItems();
  }, [items]);

  const summary = useMemo(() => getBomSummary(bomItems), [bomItems]);

  function updateItem(id, updates) {
    if (readOnly || !onChange) return;
    const next = bomItems.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    onChange(next);

    // Auto sync parent question answer & reason
    if (onSyncMainAnswer) {
      const nextSummary = getBomSummary(next);
      if (nextSummary.isAllYes) {
        onSyncMainAnswer('yes', '');
      } else if (nextSummary.hasNo) {
        const missingDesc = nextSummary.missingItems
          .map((m) => `${m.name} (Qty: ${m.qty})${m.remark ? ` - ${m.remark}` : ''}`)
          .join('; ');
        onSyncMainAnswer('no', `BOM Discrepancy / Missing: ${missingDesc}`);
      }
    }
  }

  function handleMarkAll(status) {
    if (readOnly || !onChange) return;
    const next = bomItems.map((item) => ({
      ...item,
      status,
      remark: status === 'yes' ? '' : item.remark || 'Missing on site',
    }));
    onChange(next);

    if (onSyncMainAnswer) {
      if (status === 'yes') {
        onSyncMainAnswer('yes', '');
      } else if (status === 'no') {
        const missingDesc = next.map((m) => `${m.name} (Qty: ${m.qty})`).join('; ');
        onSyncMainAnswer('no', `BOM Discrepancy / Missing: ${missingDesc}`);
      }
    }
  }

  function handleResetAll() {
    if (readOnly || !onChange) return;
    const next = bomItems.map((item) => ({ ...item, status: '', remark: '' }));
    onChange(next);
  }

  const filteredItems = useMemo(() => {
    return bomItems.filter((item) => {
      if (search) {
        const query = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesQty = String(item.qty).includes(query);
        const matchesRemark = (item.remark || '').toLowerCase().includes(query);
        if (!matchesName && !matchesQty && !matchesRemark) return false;
      }
      if (filter === 'yes') return item.status === 'yes';
      if (filter === 'no') return item.status === 'no';
      if (filter === 'pending') return !item.status;
      return true;
    });
  }, [bomItems, search, filter]);

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 16,
        borderRadius: 10,
        border: '1px solid #bfdbfe',
        background: '#f8fafc',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#eff6ff',
          borderBottom: isOpen ? '1px solid #bfdbfe' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>📦</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e3a8a' }}>
              Bill of Materials (BOM) Component Verification
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
              Physical equipment count vs approved BOM ({summary.total} items required)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Progress badge */}
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 20,
              background:
                summary.answered === summary.total
                  ? summary.noCount === 0
                    ? '#dcfce7'
                    : '#fee2e2'
                  : '#e0f2fe',
              color:
                summary.answered === summary.total
                  ? summary.noCount === 0
                    ? '#15803d'
                    : '#b91c1c'
                  : '#0369a1',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            {summary.answered}/{summary.total} Verified
            {summary.noCount > 0 && ` (${summary.noCount} Missing)`}
          </span>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isOpen ? '▲ Collapse' : '▼ View Items'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: 14 }}>
          {/* Action Bar (Only for Auditor mode) */}
          {!readOnly && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              {/* Quick Actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleMarkAll('yes')}
                  title="Mark all 33 items as Verified (Yes)"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)',
                  }}
                >
                  ✓ Mark All Yes (Complete)
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAll('no')}
                  title="Mark all items as No"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    cursor: 'pointer',
                  }}
                >
                  ✗ Mark All No
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>

              {/* Search & Filter */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="🔍 Search BOM items..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.8rem',
                    width: 170,
                    background: '#ffffff',
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'all', label: `All (${summary.total})` },
                    { id: 'pending', label: `Pending (${summary.total - summary.answered})` },
                    { id: 'no', label: `No (${summary.noCount})` },
                    { id: 'yes', label: `Yes (${summary.yesCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: '0.74rem',
                        fontWeight: filter === tab.id ? 700 : 500,
                        background: filter === tab.id ? '#1e3a8a' : '#ffffff',
                        color: filter === tab.id ? '#ffffff' : '#64748b',
                        border: '1px solid #cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BOM items list */}
          <div
            style={{
              maxHeight: 460,
              overflowY: 'auto',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
          >
            {filteredItems.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                No items match the current search or filter.
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.84rem',
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', width: 36, color: '#64748b', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '8px 10px', color: '#334155', fontWeight: 700 }}>BOM Component</th>
                    <th style={{ padding: '8px 10px', width: 75, textAlign: 'center', color: '#334155', fontWeight: 700 }}>
                      Req. Qty
                    </th>
                    <th style={{ padding: '8px 10px', width: 140, textAlign: 'center', color: '#334155', fontWeight: 700 }}>
                      Verification
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const isYes = item.status === 'yes';
                    const isNo = item.status === 'no';
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isNo ? '#fef2f2' : isYes ? '#f0fdf4' : isEven ? '#ffffff' : '#fafafa',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '0.78rem' }}>
                          {item.id}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>
                            {item.name}
                          </div>
                          {/* Remark input if No */}
                          {!readOnly && isNo && (
                            <div style={{ marginTop: 6 }}>
                              <input
                                type="text"
                                placeholder="Discrepancy remark (e.g. Missing, Damaged, Wrong Model)"
                                value={item.remark || ''}
                                onChange={(e) => updateItem(item.id, { remark: e.target.value })}
                                style={{
                                  width: '95%',
                                  padding: '4px 8px',
                                  fontSize: '0.78rem',
                                  borderRadius: 4,
                                  border: '1px solid #f87171',
                                  background: '#fff',
                                }}
                              />
                              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                {['Missing', 'Not Installed', 'Damaged', 'Model Mismatch'].map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => updateItem(item.id, { remark: tag })}
                                    style={{
                                      fontSize: '0.7rem',
                                      padding: '1px 6px',
                                      background: '#fee2e2',
                                      color: '#991b1b',
                                      border: '1px solid #fca5a5',
                                      borderRadius: 3,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    +{tag}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {readOnly && isNo && item.remark && (
                            <div style={{ marginTop: 2, fontSize: '0.76rem', color: '#b91c1c', fontStyle: 'italic' }}>
                              Remark: {item.remark}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#f1f5f9',
                              color: '#334155',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {item.qty}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {readOnly ? (
                            isYes ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                }}
                              >
                                ✓ YES
                              </span>
                            ) : isNo ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                }}
                              >
                                ✗ NO
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Pending</span>
                            )
                          ) : (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => updateItem(item.id, { status: isYes ? '' : 'yes' })}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 5,
                                  fontSize: '0.78rem',
                                  fontWeight: isYes ? 700 : 500,
                                  background: isYes ? '#16a34a' : '#ffffff',
                                  color: isYes ? '#ffffff' : '#475569',
                                  border: isYes ? '1px solid #15803d' : '1px solid #cbd5e1',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                ✓ Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => updateItem(item.id, { status: isNo ? '' : 'no' })}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 5,
                                  fontSize: '0.78rem',
                                  fontWeight: isNo ? 700 : 500,
                                  background: isNo ? '#dc2626' : '#ffffff',
                                  color: isNo ? '#ffffff' : '#475569',
                                  border: isNo ? '1px solid #b91c1c' : '1px solid #cbd5e1',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                ✗ No
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
