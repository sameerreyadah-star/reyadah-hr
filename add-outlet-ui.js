const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Check if already added
if (c.includes("adminPage === 'outlets'")) {
  console.log('Already exists');
  process.exit(0);
}

// 1. Add 'outlets' to admin toolbar buttons (after roles)
c = c.replace("'team', 'roles', 'workTimings'", "'team', 'outlets', 'roles', 'workTimings'");

// 2. Add label
const labelPart = "outlets: 'Outlet Management',";
c = c.replace("roles: 'Roles & Permissions',", "roles: 'Roles & Permissions',\n    " + labelPart);

// 3. Add state variables
const stIdx = c.indexOf('const [outlets, setOutlets]');
if (stIdx < 0) {
  // Find a good place to insert state variables (near other state)
  const stateAnchor = 'const [roles, setRoles]';
  const saIdx = c.indexOf(stateAnchor);
  if (saIdx > 0) {
    const insertState = `\n  const [outletData, setOutletData] = useState([]);\n  const [outletForm, setOutletForm] = useState({});\n  const [outletSelected, setOutletSelected] = useState(null);\n  const [outletEmpSearch, setOutletEmpSearch] = useState('');\n  const [outletUnassigned, setOutletUnassigned] = useState([]);`;
    c = c.substring(0, saIdx) + insertState + '\n  ' + c.substring(saIdx);
  }
}

// 4. Add the outlet management section before 'roles' section
const roleSectionIdx = c.indexOf("adminPage === 'roles' && h('div', { className: 'card' }");
if (roleSectionIdx > 0) {
  const outletSection = `\n            adminPage === 'outlets' && h('div', { className: 'grid', style: { gap: '16px' } }, [
              // Header
              h('div', { className: 'card' }, [
                h('div', { className: 'hero-header' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'Outlet Management'),
                    h('h2', null, 'Restaurant Outlets & Branches'),
                    h('p', { className: 'muted' }, 'Create and manage outlets, assign managers and employees, upload outlet logos.')
                  ]),
                  h('div', { className: 'hero-meta' }, [
                    h('button', { className: 'btn primary small', onClick: async () => {
                      try { const d = await apiRequest('/api/outlet-management', token); setOutletData(Array.isArray(d) ? d : []); setMessage('Loaded ' + (Array.isArray(d) ? d.length : 0) + ' outlets'); } catch (err) { setMessage(err.error || 'Failed'); }
                    } }, 'Load Outlets'),
                    h('button', { className: 'btn secondary small', onClick: () => setOutletForm({ name: '', description: '', address: '', phone: '', email: '' }) }, 'Add Outlet'),
                    h('button', { className: 'btn white small', onClick: async () => {
                      try { const u = await apiRequest('/api/outlet-management/unassigned-employees', token); setOutletUnassigned(Array.isArray(u) ? u : []); setMessage('Loaded ' + (Array.isArray(u) ? u.length : 0) + ' unassigned employees'); } catch (err) { setMessage(err.error || 'Failed'); }
                    } }, 'Unassigned Employees')
                  ])
                ])
              ]),
              // Form to create/edit outlet
              outletForm.name !== undefined && h('div', { className: 'card', style: { padding: '16px', border: '2px solid #1976d2' } }, [
                h('h3', { style: { margin: '0 0 12px' } }, outletForm.editId ? 'Edit Outlet' : 'New Outlet'),
                h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, ['Outlet Name', h('input', { value: outletForm.name, onChange: (e) => setOutletForm(p => ({ ...p, name: e.target.value })), placeholder: 'e.g. Downtown Dubai' })]),
                  h('label', { className: 'field' }, ['Description', h('input', { value: outletForm.description, onChange: (e) => setOutletForm(p => ({ ...p, description: e.target.value })), placeholder: 'Optional' })]),
                  h('label', { className: 'field' }, ['Address', h('input', { value: outletForm.address, onChange: (e) => setOutletForm(p => ({ ...p, address: e.target.value })), placeholder: 'Outlet address' })]),
                  h('label', { className: 'field' }, ['Phone', h('input', { value: outletForm.phone, onChange: (e) => setOutletForm(p => ({ ...p, phone: e.target.value })), placeholder: '+971 XX XXX XXXX' })]),
                  h('label', { className: 'field' }, ['Email', h('input', { type: 'email', value: outletForm.email, onChange: (e) => setOutletForm(p => ({ ...p, email: e.target.value })), placeholder: 'outlet@example.com' })]),
                  h('label', { className: 'field' }, ['Manager', h('select', { value: outletForm.managerId, onChange: (e) => setOutletForm(p => ({ ...p, managerId: e.target.value })) }, [
                    h('option', { value: '' }, 'Select manager...'),
                    ...employees.filter(e => e.role === 'restaurant-manager' || e.role === 'company-manager').map(m => h('option', { key: m.employeeId, value: m.employeeId }, m.name + ' (' + m.employeeId + ')'))
                  ])]),
                  h('div', { className: 'form-actions', style: { gridColumn: 'span 2' } }, [
                    h('button', { className: 'btn primary', onClick: async () => {
                      if (!outletForm.name) return setMessage('Name required');
                      try {
                        if (outletForm.editId) {
                          await apiRequest('/api/outlet-management/' + outletForm.editId, token, { method: 'PUT', body: JSON.stringify(outletForm) });
                        } else {
                          await apiRequest('/api/outlet-management', token, { method: 'POST', body: JSON.stringify(outletForm) });
                        }
                        setMessage('Saved!'); setOutletForm({});
                        const d = await apiRequest('/api/outlet-management', token); setOutletData(Array.isArray(d) ? d : []);
                      } catch (err) { setMessage(err.error || 'Failed'); }
                    }, disabled: !outletForm.name }, outletForm.editId ? 'Update' : 'Create'),
                    h('button', { className: 'btn secondary', onClick: () => setOutletForm({}) }, 'Cancel')
                  ])
                ])
              ]),
              // Outlets Grid
              outletData.length === 0 && h('div', { className: 'card' }, [
                h('p', { className: 'muted', style: { padding: '20px', textAlign: 'center' } }, 'No outlets created yet. Click "Add Outlet" to create your first outlet.')
              ]),
              h('div', { className: 'grid', style: { gap: '16px' } },
                outletData.map(outlet => h('div', { key: outlet.id, className: 'card', style: { padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', position: 'relative' } }, [
                  // Logo & Name header
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' } }, [
                    outlet.logoUrl
                      ? h('img', { src: outlet.logoUrl, style: { width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover', border: '2px solid var(--border)' } })
                      : h('div', { style: { width: '64px', height: '64px', borderRadius: '12px', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: '#fff' } }, (outlet.name || 'O')[0].toUpperCase()),
                    h('div', null, [
                      h('h3', { style: { margin: 0, fontSize: '18px' } }, outlet.name),
                      h('p', { className: 'muted', style: { fontSize: '12px' } }, (outlet.description || 'No description') + ' | ' + outlet.employeeCount + ' employees'),
                    ]),
                    h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' } }, [
                      h('span', { className: 'badge ' + (outlet.isActive !== false ? 'badge-success' : 'badge-rejected') + ' small' }, outlet.isActive !== false ? 'Active' : 'Inactive'),
                    ])
                  ]),
                  // Contact info
                  (outlet.address || outlet.phone || outlet.email) && h('div', { style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' } }, [
                    outlet.address && h('span', null, '📍 ' + outlet.address),
                    outlet.phone && h('span', null, '📞 ' + outlet.phone),
                    outlet.email && h('span', null, '✉️ ' + outlet.email),
                  ]),
                  // Manager info
                  outlet.managerId && h('div', { style: { fontSize: '12px', color: '#1976d2', marginBottom: '12px', fontWeight: 600 } },
                    '👤 Manager: ' + (outlet.employees.find(e => e.employeeId === outlet.managerId)?.name || outlet.managerId)
                  ),
                  // Employee list
                  outlet.employees.length > 0 && h('div', { style: { fontSize: '12px' } }, [
                    h('strong', { style: { display: 'block', marginBottom: '6px' } }, 'Team (' + outlet.employeeCount + '):'),
                    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                      outlet.employees.slice(0, 10).map(e => h('span', { key: e.employeeId, style: { padding: '2px 8px', borderRadius: '4px', background: e.role === 'restaurant-manager' ? '#e3f2fd' : '#f5f5f5', color: e.role === 'restaurant-manager' ? '#1565c0' : '#555', fontSize: '11px' } }, e.name || e.employeeId))
                    ),
                    outlet.employees.length > 10 && h('p', { className: 'muted', style: { fontSize: '11px', marginTop: '4px' } }, '...and ' + (outlet.employees.length - 10) + ' more')
                  ]),
                  !outlet.employees.length && h('p', { className: 'muted', style: { fontSize: '12px' } }, 'No employees assigned yet.'),
                  // Action buttons
                  h('div', { style: { marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                    h('button', { className: 'btn white small', onClick: () => setOutletForm({
                      editId: outlet.id, name: outlet.name, description: outlet.description || '',
                      address: outlet.address || '', phone: outlet.phone || '', email: outlet.email || '',
                      managerId: outlet.managerId || ''
                    }) }, 'Edit'),
                    h('button', { className: 'btn white small', onClick: () => setOutletSelected(outlet) }, 'Assign Employees'),
                    h('label', { className: 'btn white small', style: { cursor: 'pointer' } }, [
                      'Upload Logo',
                      h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        try {
                          const form = new FormData();
                          form.append('logo', file);
                          await apiRequest('/api/outlet-management/' + outlet.id + '/logo', token, { method: 'POST', body: form });
                          setMessage('Logo uploaded!');
                          const d = await apiRequest('/api/outlet-management', token); setOutletData(Array.isArray(d) ? d : []);
                        } catch (err) { setMessage(err.error || 'Failed'); }
                      } })
                    ]),
                    h('button', { className: 'btn red small', onClick: async () => {
                      if (!window.confirm('Delete outlet "' + outlet.name + '"?')) return;
                      try { await apiRequest('/api/outlet-management/' + outlet.id, token, { method: 'DELETE' }); setMessage('Deleted'); const d = await apiRequest('/api/outlet-management', token); setOutletData(Array.isArray(d) ? d : []); } catch (err) { setMessage(err.error || 'Failed'); }
                    } }, 'Delete')
                  ])
                ]))
              ),
              // Assign Employees Modal
              outletSelected && h('div', { style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: () => setOutletSelected(null) },
                h('div', { style: { background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }, onClick: e => e.stopPropagation() }, [
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' } }, [
                    h('div', null, [h('h3', { style: { margin: 0 } }, 'Assign Employees to ' + outletSelected.name), h('p', { className: 'muted', style: { margin: '4px 0 0' } }, 'Select employees to assign to this outlet.')]),
                    h('button', { style: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }, onClick: () => setOutletSelected(null) }, '✕')
                  ]),
                  h('input', { type: 'text', value: outletEmpSearch, onChange: (e) => setOutletEmpSearch(e.target.value), placeholder: 'Search employees...', style: { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px', boxSizing: 'border-box' } }),
                  h('div', null,
                    employees.filter(e => !outletEmpSearch || (e.name || '').toLowerCase().includes(outletEmpSearch.toLowerCase()) || (e.employeeId || '').toLowerCase().includes(outletEmpSearch.toLowerCase())).slice(0, 30).map(e => {
                      const assigned = outletSelected.employees?.find(oe => oe.employeeId === e.employeeId);
                      return h('label', { key: e.employeeId, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: assigned ? '#e3f2fd' : 'transparent', marginBottom: '4px' } }, [
                        h('input', { type: 'checkbox', checked: !!assigned, onChange: async () => {
                          const ids = assigned
                            ? outletSelected.employees.filter(oe => oe.employeeId !== e.employeeId).map(oe => oe.employeeId)
                            : [...(outletSelected.employees || []).map(oe => oe.employeeId), e.employeeId];
                          try {
                            await apiRequest('/api/outlet-management/' + outletSelected.id + '/assign-employees', token, { method: 'POST', body: JSON.stringify({ employeeIds: ids }) });
                            const d = await apiRequest('/api/outlet-management', token); setOutletData(Array.isArray(d) ? d : []);
                            setOutletSelected(d.find(o => o.id === outletSelected.id) || outletSelected);
                          } catch (err) { setMessage(err.error || 'Failed'); }
                        } }),
                        e.photoUrl ? h('img', { src: e.photoUrl, style: { width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' } }) : h('div', { style: { width: '28px', height: '28px', borderRadius: '50%', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 } }, (e.name || '?')[0]),
                        h('div', null, [h('strong', { style: { fontSize: '13px' } }, e.name || 'Unnamed'), h('p', { style: { fontSize: '11px', color: '#666', margin: 0 } }, e.employeeId + ' · ' + (e.role || 'employee'))])
                      ]);
                    })
                  ),
                  outletSelected.employees?.length > 0 && h('p', { className: 'muted', style: { marginTop: '12px', fontSize: '12px', textAlign: 'center' } }, outletSelected.employees.length + ' employees assigned')
                ])
              ),
              // Unassigned employees section
              outletUnassigned.length > 0 && h('div', { className: 'card', style: { padding: '16px' } }, [
                h('h3', null, 'Unassigned Employees (' + outletUnassigned.length + ')'),
                h('p', { className: 'muted', style: { fontSize: '12px', marginBottom: '12px' } }, 'These employees have no outlet assigned.'),
                h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  outletUnassigned.map(e => h('span', { key: e.employeeId, style: { padding: '4px 10px', borderRadius: '6px', background: '#fff3e0', fontSize: '12px' } }, e.name || e.employeeId))
                ),
                h('button', { className: 'btn white small', style: { marginTop: '10px' }, onClick: () => setOutletUnassigned([]) }, 'Clear')
              ])
            ]),

`;
  c = c.substring(0, roleSectionIdx) + outletSection + '\n' + c.substring(roleSectionIdx);
}

fs.writeFileSync('public/app.js', c);
console.log('Added Outlet Management UI');