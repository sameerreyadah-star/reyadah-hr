const fs = require('fs');
const path = 'c:/Users/samir mulla/OneDrive/Pictures/Documents/COMPANY/Attandance system/public/app.js';
let c = fs.readFileSync(path, 'utf8');

// Find the workTimings section start
const startMarker = "adminPage === 'workTimings' && h('div', { className: 'card' }, [";
const endMarker = "adminPage === 'holidays'";

const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker, startIdx + 1);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found');
  process.exit(1);
}

const newSection = `adminPage === 'workTimings' && h('div', { className: 'grid' }, [
  h('div', { className: 'card' }, [
    h('div', { className: 'panel-heading' }, [
      h('div', null, [
        h('p', { className: 'eyebrow' }, 'Attendance Correction'),
        h('h2', null, 'Employee Attendance Manager'),
        h('p', { className: 'muted' }, 'Search employees, view day-wise attendance, and correct check-in/check-out times to avoid salary deductions.')
      ]),
      h('div', { className: 'directory-controls' }, [
        h('input', { value: wtSearch, onChange: (e) => setWtSearch(e.target.value), placeholder: 'Search employee by ID or name...', style: { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' } }),
        h('span', { className: 'muted', style: { fontSize: '12px' } }, employees.filter(e => !wtSearch || (e.name||'').toLowerCase().includes(wtSearch.toLowerCase()) || (e.employeeId||'').toLowerCase().includes(wtSearch.toLowerCase())).length + '/' + employees.length)
      ])
    ])
  ]),
  h('div', { className: 'grid', style: { gap: '8px', maxHeight: '300px', overflowY: 'auto' } },
    employees.filter(e => !wtSearch || (e.name||'').toLowerCase().includes(wtSearch.toLowerCase()) || (e.employeeId||'').toLowerCase().includes(wtSearch.toLowerCase())).slice(0, 20).map(emp => h('div', {
      key: emp.id,
      className: 'card',
      style: { padding: '10px 14px', cursor: 'pointer', border: (selectedEmp && selectedEmp.employeeId === emp.employeeId ? '2px solid #1976d2' : '1px solid var(--border)'), background: (selectedEmp && selectedEmp.employeeId === emp.employeeId ? '#e3f2fd' : '') },
      onClick: async () => {
        setSelectedEmp(emp);
        setWtLoading(true); setWtError('');
        try {
          const data = await apiRequest('/api/attendance/employee/' + emp.employeeId + '/month/' + wtYear + '/' + wtMonth, token);
          setWtDays(data.days || []);
          setWtDate(new Date(data.year || wtYear, (data.month || wtMonth) - 1));
        } catch (err) { setWtError(err.error || 'Failed'); setWtDays([]); }
        finally { setWtLoading(false); }
      }
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
        emp.photoUrl ? h('img', { src: emp.photoUrl, style: { width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' } }) : h('div', { style: { width: '36px', height: '36px', borderRadius: '50%', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 } }, (emp.name || '?')[0]),
        h('div', null, [h('strong', { style: { fontSize: '13px' } }, emp.name || 'Unnamed'), h('p', { style: { fontSize: '11px', color: '#666' } }, emp.employeeId + ' · ' + (emp.designation || '—'))])
      ])
    ]))
  ),
  selectedEmp && h('div', { className: 'card' }, [
    h('div', { className: 'hero-header' }, [
      h('div', null, [
        h('p', { className: 'eyebrow' }, selectedEmp.name || selectedEmp.employeeId),
        h('h2', null, 'Attendance - ' + (wtDate ? wtDate.toLocaleString('default', { month: 'long', year: 'numeric' }) : ''))
      ]),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
        h('button', { className: 'btn secondary small', onClick: () => { const d = new Date(wtDate.getFullYear(), wtDate.getMonth() - 1, 1); setWtDate(d); setWtYear(d.getFullYear()); setWtMonth(d.getMonth() + 1); loadWtAttendance(selectedEmp, d.getFullYear(), d.getMonth() + 1); } }, '◀'),
        h('span', { style: { fontSize: '12px', fontWeight: 600 } }, wtDate ? wtDate.toLocaleString('default', { month: 'short', year: 'numeric' }) : ''),
        h('button', { className: 'btn secondary small', onClick: () => { const d = new Date(wtDate.getFullYear(), wtDate.getMonth() + 1, 1); setWtDate(d); setWtYear(d.getFullYear()); setWtMonth(d.getMonth() + 1); loadWtAttendance(selectedEmp, d.getFullYear(), d.getMonth() + 1); } }, '▶'),
      ])
    ]),
    wtError && h('div', { style: { padding: '8px 14px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '8px' } }, wtError),
    wtLoading ? h('p', { className: 'muted' }, 'Loading...') :
    h('div', { style: { overflowX: 'auto' } }, [
      h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } }, [
        h('thead', null, h('tr', { style: { background: 'var(--accent-soft)' } }, [
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'left', minWidth: '50px' } }, 'Day'),
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '60px' } }, 'Date'),
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '60px' } }, 'Status'),
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '80px' } }, 'Clock In'),
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '80px' } }, 'Clock Out'),
          h('th', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center', minWidth: '100px' } }, 'Action'),
        ])),
        h('tbody', null, wtDays.length === 0 ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', padding: '20px', color: '#999' } }, 'No attendance records for this month')) : wtDays.map((day, idx) => {
          const dateStr = (wtYear || wtDate.getFullYear()) + '-' + String(wtMonth || (wtDate.getMonth() + 1)).padStart(2, '0') + '-' + String(day.day || (idx + 1)).padStart(2, '0');
          const clockInTime = day.clockIn ? new Date(day.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
          const clockOutTime = day.clockOut ? new Date(day.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
          const isEditing = wtEditDay === (day.day || (idx + 1));
          return h('tr', { key: day.id || idx, style: { borderBottom: '1px solid var(--border)' } }, [
            h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', fontWeight: 600 } }, String(day.day || (idx + 1))),
            h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center' } }, dateStr),
            h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center' } }, h('span', { className: 'attendance-status-chip ' + (day.status === 'p' ? 'present' : day.status === 'a' ? 'absent' : day.status === 'o' ? 'holiday' : 'not-marked') }, (day.status || 'NS').toUpperCase())),
            isEditing ? h('td', { style: { padding: '4px 6px', border: '1px solid var(--border)', textAlign: 'center' } }, h('input', { type: 'time', value: wtEditClockIn || '', onChange: (e) => setWtEditClockIn(e.target.value), style: { width: '85px', padding: '3px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' } })) : h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center' } }, clockInTime),
            isEditing ? h('td', { style: { padding: '4px 6px', border: '1px solid var(--border)', textAlign: 'center' } }, h('input', { type: 'time', value: wtEditClockOut || '', onChange: (e) => setWtEditClockOut(e.target.value), style: { width: '85px', padding: '3px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' } })) : h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center' } }, clockOutTime),
            h('td', { style: { padding: '6px 8px', border: '1px solid var(--border)', textAlign: 'center' } },
              isEditing
                ? h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'center' } }, [
                    h('button', { className: 'btn primary small', onClick: async () => {
                      try {
                        const payload = {};
                        if (wtEditClockIn) payload.clockIn = dateStr + 'T' + wtEditClockIn + ':00';
                        if (wtEditClockOut) payload.clockOut = dateStr + 'T' + wtEditClockOut + ':00';
                        if (day.id) await apiRequest('/api/attendance/' + day.id, token, { method: 'PUT', body: JSON.stringify(payload) });
                        else await apiRequest('/api/attendance', token, { method: 'POST', body: JSON.stringify({ employeeId: selectedEmp.employeeId, date: dateStr, ...payload }) });
                        setMessage('Saved!');
                        setWtEditDay(null);
                        const data = await apiRequest('/api/attendance/employee/' + selectedEmp.employeeId + '/month/' + (wtYear || wtDate.getFullYear()) + '/' + (wtMonth || (wtDate.getMonth() + 1)), token);
                        setWtDays(data.days || []);
                      } catch (err) { setWtError(err.error || 'Failed'); }
                    } }, 'Save'),
                    h('button', { className: 'btn secondary small', onClick: () => { setWtEditDay(null); setWtEditClockIn(''); setWtEditClockOut(''); } }, 'Cancel')
                  ])
                : h('button', { className: 'btn white small', onClick: () => {
                    setWtEditDay(day.day || (idx + 1));
                    setWtEditClockIn(day.clockIn ? new Date(day.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
                    setWtEditClockOut(day.clockOut ? new Date(day.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
                  } }, (day.clockIn || day.clockOut) ? 'Edit' : 'Add')
            )
          ]);
        }))
      ])
    ])
  ])
]),
`;

// Remove from start to just before holidays
c = c.slice(0, startIdx) + newSection + '\n\n' + c.slice(endIdx);

// Update state variables
const oldState = "const [workTimings, setWorkTimings] = useState([]);\n  const [workTimingForm, setWorkTimingForm] = useState({});";
const newState = "const [wtSearch, setWtSearch] = useState('');\n  const [selectedEmp, setSelectedEmp] = useState(null);\n  const [wtDays, setWtDays] = useState([]);\n  const [wtLoading, setWtLoading] = useState(false);\n  const [wtError, setWtError] = useState('');\n  const [wtDate, setWtDate] = useState(new Date());\n  const [wtYear, setWtYear] = useState(new Date().getFullYear());\n  const [wtMonth, setWtMonth] = useState(new Date().getMonth() + 1);\n  const [wtEditDay, setWtEditDay] = useState(null);\n  const [wtEditClockIn, setWtEditClockIn] = useState('');\n  const [wtEditClockOut, setWtEditClockOut] = useState('');\n  const loadWtAttendance = async (emp, year, month) => {\n    if (!emp) return;\n    setWtLoading(true); setWtError('');\n    try {\n      const data = await apiRequest('/api/attendance/employee/' + emp.employeeId + '/month/' + year + '/' + month, token);\n      setWtDays(data.days || []);\n    } catch (err) { setWtError(err.error || 'Failed'); setWtDays([]); }\n    finally { setWtLoading(false); }\n  };";
c = c.replace(oldState, newState);

fs.writeFileSync(path, c);
console.log('Done - Replaced workTimings with Attendance Correction Manager');