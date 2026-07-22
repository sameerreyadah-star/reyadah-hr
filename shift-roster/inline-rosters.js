// ==================== SHIFT ROSTER DIRECT INLINE IMPLEMENTATION ====================
// This code replaces the iframe-based shift roster with native inline UI
// that uses the same token, employees, and components as the main app.
// Copy the block below into public/app.js at the shift-roster tab rendering.

/*
Replace this in app.js:

tab === 'shift-roster' && canView('shift-roster') && h('div', { className: 'grid', style: { width: '100%', height: 'calc(100vh - 120px)', overflow: 'hidden' } }, [
          h('iframe', {
            src: '/shift-roster?token=' + encodeURIComponent(token),
            style: { width: '100%', height: '100%', border: 'none', borderRadius: '12px' },
          }),
        ]),

WITH this:
*/

// Add these state declarations near other useState declarations:
// const [srShifts, setSrShifts] = useState([
//   { id: 'MORN', name: 'Morning', start: '06:00', end: '14:00', color: '#3B82F6' },
//   { id: 'EVEN', name: 'Evening', start: '14:00', end: '22:00', color: '#8B5CF6' },
//   { id: 'NIGHT', name: 'Night', start: '22:00', end: '06:00', color: '#1F2937' },
//   { id: 'GEN', name: 'General', start: '09:00', end: '18:00', color: '#2563EB' },
// ]);
// const [srAssignments, setSrAssignments] = useState({});
// const [srLoading, setSrLoading] = useState(false);
// const [srMonth, setSrMonth] = useState(new Date().getMonth());
// const [srYear, setSrYear] = useState(new Date().getFullYear());
// const [srEditing, setSrEditing] = useState(null); // { empId, day, date }
// const [srSaving, setSrSaving] = useState(false);
// const [srError, setSrError] = useState('');

// Replace the iframe block:

tab === 'shift-roster' && canView('shift-roster') && h('div', { className: 'grid' }, [
  // Header
  h('div', { className: 'card' }, [
    h('div', { className: 'hero-header' }, [
      h('div', null, [
        h('p', { className: 'eyebrow' }, 'Shift Roster'),
        h('h2', null, 'Monthly Shift Roster'),
        h('p', { className: 'muted' }, `Assign shifts to employees for ${new Date(srYear, srMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}`),
      ]),
      h('div', { className: 'hero-meta', style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' } }, [
        h('label', { className: 'field compact-field' }, [
          'Month',
          h('select', { value: srMonth, onChange: (e) => setSrMonth(Number(e.target.value)) },
            Array.from({ length: 12 }, (_, i) => h('option', { key: i, value: i }, new Date(2000, i).toLocaleString('default', { month: 'long' })))
          ),
        ]),
        h('label', { className: 'field compact-field' }, [
          'Year',
          h('input', { type: 'number', value: srYear, onChange: (e) => setSrYear(Number(e.target.value) || new Date().getFullYear()), style: { width: '80px' } }),
        ]),
        h('button', { className: 'btn primary small', onClick: async () => {
          setSrLoading(true);
          setSrError('');
          try {
            const data = await apiRequest('/api/shift-roster/assignments?month=' + (srMonth + 1) + '&year=' + srYear, token);
            const map = {};
            (data || []).forEach(a => {
              const key = a.employeeId + '_' + a.date;
              map[key] = a.shiftId;
            });
            setSrAssignments(map);
          } catch (err) {
            setSrError('Failed to load roster data');
          } finally {
            setSrLoading(false);
          }
        }, srLoading ? 'Loading...' : 'Load Roster' }),
        h('button', { className: 'btn secondary small', onClick: () => {
          setSrMonth(new Date().getMonth());
          setSrYear(new Date().getFullYear());
        }}, 'Today'),
      ]),
    ]),
  ]),

  // Error message
  srError && h('div', { className: 'card', style: { background: '#fee', padding: '12px', borderLeft: '3px solid #e53935' } }, srError),

  // Shift legend
  h('div', { className: 'card', style: { padding: '12px' } }, [
    h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' } }, [
      h('strong', { style: { fontSize: '13px' } }, 'Shifts:'),
      ...srShifts.map(s => h('span', { key: s.id, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', background: s.color, color: '#fff', fontSize: '12px', fontWeight: 600 } },
        s.name + ' (' + s.start + '-' + s.end + ')'
      )),
    ]),
  ]),

  // Roster table
  h('div', { className: 'card', style: { overflowX: 'auto', padding: '16px' } }, [
    srLoading ? h('p', { className: 'muted' }, 'Loading...') :
    employees.length === 0 ? h('p', { className: 'muted' }, 'No employees loaded. Click "Load Roster" to begin.') :
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } }, [
      // Header
      h('thead', null, h('tr', { style: { background: 'var(--accent-soft)' } }, [
        h('th', { style: { padding: '8px', border: '1px solid var(--border)', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--accent-soft)', zIndex: 1, minWidth: '140px' } }, 'Employee'),
        ...Array.from({ length: new Date(srYear, srMonth + 1, 0).getDate() }, (_, i) => {
          const day = i + 1;
          const date = new Date(srYear, srMonth, day);
          const isToday = date.toDateString() === new Date().toDateString();
          return h('th', { key: day, style: { padding: '6px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '36px', background: isToday ? '#e3f2fd' : 'var(--accent-soft)', fontWeight: isToday ? 700 : 600 } },
            day
          );
        }),
      ])),
      // Body
      h('tbody', null,
        employees.filter(e => {
          const q = (companySearch || '').toLowerCase();
          return !q || (e.name || '').toLowerCase().includes(q) || (e.employeeId || '').toLowerCase().includes(q);
        }).map(emp => {
          const daysInMonth = new Date(srYear, srMonth + 1, 0).getDate();
          return h('tr', { key: emp.id, style: { borderBottom: '1px solid var(--border)' } }, [
            h('td', { style: { padding: '6px', border: '1px solid var(--border)', position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 } },
              (emp.name || emp.employeeId || 'Unknown') + ' (' + (emp.employeeId || emp.id) + ')'
            ),
            ...Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const date = srYear + '-' + String(srMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
              const key = emp.employeeId + '_' + date;
              const shiftId = srAssignments[key];
              const shift = srShifts.find(s => s.id === shiftId);
              const isEditing = srEditing && srEditing.empId === emp.employeeId && srEditing.day === day;
              return h('td', {
                key: day,
                style: { padding: '2px', border: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer', background: shift ? shift.color + '22' : 'transparent' },
                onClick: () => setSrEditing({ empId: emp.employeeId, day, date, shiftId: shiftId || '' }),
              },
                isEditing
                  ? h('select', {
                      value: srEditing.shiftId || '',
                      onChange: (e) => {
                        const val = e.target.value;
                        setSrEditing(prev => ({ ...prev, shiftId: val }));
                      },
                      onBlur: () => {
                        const eShift = srEditing.shiftId;
                        const eKey = emp.employeeId + '_' + date;
                        setSrAssignments(prev => {
                          const next = { ...prev };
                          if (eShift) next[eKey] = eShift;
                          else delete next[eKey];
                          return next;
                        });
                        setSrEditing(null);
                      },
                      style: { width: '100%', fontSize: '10px', padding: '2px' },
                      autoFocus: true,
                    }, [
                      h('option', { value: '' }, '-'),
                      ...srShifts.map(s => h('option', { key: s.id, value: s.id, style: { background: s.color, color: '#fff' } }, s.name)),
                    ])
                  : shift
                    ? h('span', { style: { display: 'inline-block', width: '100%', height: '100%', fontSize: '10px', fontWeight: 600, color: shift.color } }, shift.name.charAt(0))
                    : h('span', { style: { color: '#ccc' } }, '-')
              );
            }),
          ]);
        })
      ),
    ]),
  ]),

  // Action buttons
  h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, [
    h('button', { className: 'btn secondary', onClick: () => { setSrAssignments({}); setSrError(''); } }, 'Clear'),
    h('button', {
      className: 'btn primary',
      onClick: async () => {
        setSrSaving(true);
        setSrError('');
        try {
          const payload = [];
          Object.entries(srAssignments).forEach(([key, shiftId]) => {
            const parts = key.split('_');
            payload.push({ employeeId: parts[0], date: parts.slice(1).join('_'), shiftId });
          });
          await apiRequest('/api/shift-roster/save', token, {
            method: 'POST',
            body: JSON.stringify({ assignments: payload }),
          });
          setMessage('Roster saved successfully');
        } catch (err) {
          setSrError('Save failed: ' + (err.error || err.message));
        } finally {
          setSrSaving(false);
        }
      },
      disabled: srSaving,
    }, srSaving ? 'Saving...' : 'Save Roster'),
  ]),
]);