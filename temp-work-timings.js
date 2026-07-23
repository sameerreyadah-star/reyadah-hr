// Work Timings section - inject before holidays section
adminPage === 'workTimings' && h('div', { className: 'card' }, [
  h('div', { className: 'panel-heading' }, [
    h('div', null, [
      h('p', { className: 'eyebrow' }, 'Work Timings'),
      h('h2', null, 'Manage Check-In / Check-Out Timings'),
      h('p', { className: 'muted' }, 'Set and manage employee work timings, break schedules, and working days for each outlet.')
    ]),
    h('button', { className: 'btn primary small', onClick: async () => {
      setMessage('Loading...');
      try {
        const d = await apiRequest('/api/work-timings', token);
        setWorkTimings(Array.isArray(d) ? d : []);
        setMessage('Loaded ' + (Array.isArray(d) ? d.length : 0) + ' timings');
      } catch (err) { setMessage(err.error || 'Failed to load'); }
    } }, '🔄 Load'),
    h('button', { className: 'btn secondary small', onClick: () => setWorkTimingForm({
      outletName: '', shiftStart: '09:00', shiftEnd: '18:00',
      breakStart: '13:00', breakEnd: '14:00',
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      description: ''
    }) }, '➕ Add New')
  ]),
  workTimings.length === 0 && !workTimingForm.outletName && h('p', { className: 'muted', style: { padding: '20px', textAlign: 'center' } }, 'No work timings configured yet. Click Add New to create one.'),
  workTimingForm.outletName !== undefined && h('div', { className: 'card', style: { marginBottom: '16px', padding: '16px', border: '2px solid var(--accent)' } }, [
    h('h3', null, workTimingForm.editId ? 'Edit Timing' : 'New Timing'),
    h('div', { className: 'form-grid' }, [
      h('label', { className: 'field' }, ['Outlet Name', h('input', { value: workTimingForm.outletName, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, outletName: e.target.value })), placeholder: 'e.g. Downtown Branch' })]),
      h('label', { className: 'field' }, ['Shift Start', h('input', { type: 'time', value: workTimingForm.shiftStart, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, shiftStart: e.target.value })) })]),
      h('label', { className: 'field' }, ['Shift End', h('input', { type: 'time', value: workTimingForm.shiftEnd, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, shiftEnd: e.target.value })) })]),
      h('label', { className: 'field' }, ['Break Start', h('input', { type: 'time', value: workTimingForm.breakStart, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, breakStart: e.target.value })) })]),
      h('label', { className: 'field' }, ['Break End', h('input', { type: 'time', value: workTimingForm.breakEnd, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, breakEnd: e.target.value })) })]),
      h('label', { className: 'field' }, ['Description', h('input', { value: workTimingForm.description, onChange: (e) => setWorkTimingForm(prev => ({ ...prev, description: e.target.value })), placeholder: 'Optional notes' })]),
      h('label', { className: 'field', style: { gridColumn: 'span 2' } }, ['Working Days', h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => h('label', { key: d, style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' } }, [
          h('input', { type: 'checkbox', checked: workTimingForm.workingDays.includes(d), onChange: () => setWorkTimingForm(prev => ({ ...prev, workingDays: prev.workingDays.includes(d) ? prev.workingDays.filter(x => x !== d) : [...prev.workingDays, d] })) }),
          d
        ]))
      )]),
      h('div', { className: 'form-actions', style: { gridColumn: 'span 2' } }, [
        h('button', { className: 'btn primary', onClick: async () => {
          if (!workTimingForm.outletName || !workTimingForm.shiftStart || !workTimingForm.shiftEnd) return setMessage('Outlet name, shift start and end are required');
          try {
            const method = workTimingForm.editId ? 'PUT' : 'POST';
            const url = workTimingForm.editId ? '/api/work-timings/' + workTimingForm.editId : '/api/work-timings';
            await apiRequest(url, token, { method, body: JSON.stringify(workTimingForm) });
            setMessage(workTimingForm.editId ? 'Updated!' : 'Created!');
            setWorkTimingForm({});
            const d = await apiRequest('/api/work-timings', token);
            setWorkTimings(Array.isArray(d) ? d : []);
          } catch (err) { setMessage(err.error || 'Failed'); }
        }, disabled: !workTimingForm.outletName || !workTimingForm.shiftStart || !workTimingForm.shiftEnd }, workTimingForm.editId ? 'Update' : 'Create'),
        h('button', { className: 'btn secondary', onClick: () => setWorkTimingForm({}) }, 'Cancel')
      ])
    ])
  ]),
  workTimings.length > 0 && h('div', { className: 'grid', style: { gap: '12px', marginTop: '12px' } },
    workTimings.map(t => h('div', { key: t.id, className: 'card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
        h('div', null, [
          h('strong', { style: { fontSize: '15px' } }, t.outletName),
          h('p', { className: 'muted', style: { fontSize: '12px' } }, t.shiftStart + ' - ' + t.shiftEnd + (t.breakStart ? ' | Break: ' + t.breakStart + '-' + t.breakEnd : '') + (t.description ? ' | ' + t.description : ''))
        ]),
        h('div', { style: { display: 'flex', gap: '6px' } }, [
          h('span', { className: 'badge ' + (t.isActive !== false ? 'badge-success' : 'badge-rejected') + ' small' }, t.isActive !== false ? 'Active' : 'Inactive'),
          h('button', { className: 'btn white small', onClick: () => setWorkTimingForm({
            editId: t.id, outletName: t.outletName, shiftStart: t.shiftStart, shiftEnd: t.shiftEnd,
            breakStart: t.breakStart || '', breakEnd: t.breakEnd || '',
            workingDays: t.workingDays || ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
            description: t.description || ''
          }) }, 'Edit'),
          h('button', { className: 'btn red small', onClick: async () => {
            if (!window.confirm('Delete timing for ' + t.outletName + '?')) return;
            try {
              await apiRequest('/api/work-timings/' + t.id, token, { method: 'DELETE' });
              setMessage('Deleted');
              const d = await apiRequest('/api/work-timings', token);
              setWorkTimings(Array.isArray(d) ? d : []);
            } catch (err) { setMessage(err.error || 'Failed'); }
          } }, 'Delete')
        ])
      ]),
      h('div', { style: { marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' } }, 'Working days: ' + (t.workingDays || []).join(', '))
    ]))
  ),
]),