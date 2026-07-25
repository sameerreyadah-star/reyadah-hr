const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// 1. Add 'roles' to the admin toolbar buttons
c = c.replace("['team', 'workTimings'", "['team', 'roles', 'workTimings'");

// 2. Add label to adminPageLabels
if (!c.includes("roles:")) {
  c = c.replace("workTimings: 'Attendance Correction'", "roles: 'Roles & Permissions',\n    workTimings: 'Attendance Correction'");
}

// 3. Add state variables
if (!c.includes('const [roles, setRoles]')) {
  const testIdx = c.indexOf('const [testResult, setTestResult]');
  if (testIdx > 0) {
    const lineEnd = c.indexOf('\n', testIdx);
    const insert = `\n  const [roles, setRoles] = useState([]);\n  const [roleForm, setRoleForm] = useState({});`;
    c = c.substring(0, lineEnd + 1) + insert + c.substring(lineEnd + 1);
  }
}

// 4. Add roles section before holidays
if (!c.includes("adminPage === 'roles'")) {
  const holidayIdx = c.indexOf("adminPage === 'holidays' && h('div', { className: 'card admin-section-card' }");
  if (holidayIdx > 0) {
    const section = `
            adminPage === 'roles' && h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Roles & Permissions'),
                  h('h2', null, 'Manage Custom Roles'),
                  h('p', { className: 'muted' }, 'Create new roles beyond the default 4. Only admins can manage roles.')
                ]),
                h('button', { className: 'btn primary small', onClick: async () => {
                  try { const d = await apiRequest('/api/roles', token); setRoles(Array.isArray(d) ? d : []); setMessage('Loaded ' + (Array.isArray(d) ? d.length : 0) + ' roles'); }
                  catch (err) { setMessage(err.error || 'Failed'); }
                } }, '🔄 Load'),
                h('button', { className: 'btn secondary small', onClick: () => setRoleForm({ name: '', label: '', description: '' }) }, '➕ Add Role')
              ]),
              roleForm.name !== undefined && h('div', { style: { padding: '16px', marginBottom: '12px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' } }, [
                h('h3', null, roleForm.editId ? 'Edit Role' : 'New Role'),
                h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, ['Role Key', h('input', { value: roleForm.name, onChange: (e) => setRoleForm(p => ({ ...p, name: e.target.value })), placeholder: 'e.g. accountant' })]),
                  h('label', { className: 'field' }, ['Display Label', h('input', { value: roleForm.label, onChange: (e) => setRoleForm(p => ({ ...p, label: e.target.value })), placeholder: 'e.g. Accountant' })]),
                  h('label', { className: 'field', style: { gridColumn: 'span 2' } }, ['Description', h('textarea', { value: roleForm.description, onChange: (e) => setRoleForm(p => ({ ...p, description: e.target.value })), rows: 2, placeholder: 'Optional' })]),
                  h('div', { className: 'form-actions', style: { gridColumn: 'span 2' } }, [
                    h('button', { className: 'btn primary', onClick: async () => {
                      if (!roleForm.name || !roleForm.label) return setMessage('Name and label required');
                      try {
                        if (roleForm.editId) await apiRequest('/api/roles/' + roleForm.editId, token, { method: 'PUT', body: JSON.stringify({ name: roleForm.name, label: roleForm.label, description: roleForm.description }) });
                        else await apiRequest('/api/roles', token, { method: 'POST', body: JSON.stringify({ name: roleForm.name, label: roleForm.label, description: roleForm.description }) });
                        setMessage('Saved!'); setRoleForm({});
                        const d = await apiRequest('/api/roles', token); setRoles(Array.isArray(d) ? d : []);
                      } catch (err) { setMessage(err.error || 'Failed'); }
                    }, disabled: !roleForm.name || !roleForm.label }, roleForm.editId ? 'Update' : 'Create'),
                    h('button', { className: 'btn secondary', onClick: () => setRoleForm({}) }, 'Cancel')
                  ])
                ])
              ]),
              roles.length === 0 && !roleForm.name && h('p', { className: 'muted', style: { padding: '20px', textAlign: 'center' } }, 'No custom roles created yet. Click Load or Add Role to start.'),
              roles.map(r => h('div', { key: r.id, style: { padding: '12px 16px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                h('div', null, [h('strong', null, r.label), h('span', { style: { fontSize: '12px', color: '#666', marginLeft: '8px' } }, 'key: ' + r.name)]),
                h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
                  h('span', { className: 'badge ' + (r.isActive !== false ? 'badge-success' : 'badge-rejected') + ' small' }, r.isActive !== false ? 'Active' : 'Inactive'),
                  h('button', { className: 'btn white small', onClick: () => setRoleForm({ editId: r.id, name: r.name, label: r.label, description: r.description || '' }) }, 'Edit'),
                  !['admin','company-manager','restaurant-manager','employee'].includes(r.name) && h('button', { className: 'btn red small', onClick: async () => {
                    if (!window.confirm('Delete role "' + r.label + '"?')) return;
                    try { await apiRequest('/api/roles/' + r.id, token, { method: 'DELETE' }); setMessage('Deleted'); const d = await apiRequest('/api/roles', token); setRoles(Array.isArray(d) ? d : []); }
                    catch (err) { setMessage(err.error || 'Failed'); }
                  } }, 'Delete')
                ])
              ]))
            ]),

`;
    c = c.substring(0, holidayIdx) + section + '            ' + c.substring(holidayIdx);
  }
}

fs.writeFileSync('public/app.js', c);
console.log('Done');