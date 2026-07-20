const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('reyadahToken') || '';
}

export async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API request failed');
  return data;
}

export async function fetchEmployees() {
  return apiFetch('/shift-roster/employees');
}

export async function fetchAssignments(month, year) {
  return apiFetch(`/shift-roster/assignments?month=${month}&year=${year}`);
}

export async function saveAssignment(employeeId, date, shiftId, notes = '') {
  return apiFetch('/shift-roster/assignments', {
    method: 'POST',
    body: JSON.stringify({ employeeId, date, shiftId, notes }),
  });
}

export async function saveRoster(assignments) {
  return apiFetch('/shift-roster/save', {
    method: 'POST',
    body: JSON.stringify({ assignments }),
  });
}