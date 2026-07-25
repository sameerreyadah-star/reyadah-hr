const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

// Find the line with "const [testResult"
const idx = c.indexOf('const [testResult, setTestResult]');
if (idx < 0) {
  console.log('Could not find insertion point');
  process.exit(1);
}

// Insert after testResult line
const lineEnd = c.indexOf('\n', idx);
const lineEndIdx = c.indexOf('\r', idx) !== -1 && c.indexOf('\r', idx) < c.indexOf('\n', idx) ? c.indexOf('\r', idx) + 1 : lineEnd;

const insert = `\n  const [wtSearch, setWtSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [wtDays, setWtDays] = useState([]);
  const [wtLoading, setWtLoading] = useState(false);
  const [wtError, setWtError] = useState('');
  const [wtDate, setWtDate] = useState(new Date());
  const [wtYear, setWtYear] = useState(new Date().getFullYear());
  const [wtMonth, setWtMonth] = useState(new Date().getMonth() + 1);
  const [wtEditDay, setWtEditDay] = useState(null);
  const [wtEditClockIn, setWtEditClockIn] = useState('');
  const [wtEditClockOut, setWtEditClockOut] = useState('');
  const loadWtAttendance = async (emp, year, month) => {
    if (!emp) return;
    setWtLoading(true); setWtError('');
    try {
      const data = await apiRequest('/api/attendance/employee/' + emp.employeeId + '/month/' + year + '/' + month, token);
      setWtDays(data.days || []);
    } catch (err) { setWtError(err.error || 'Failed'); setWtDays([]); }
    finally { setWtLoading(false); }
  };`;

c = c.substring(0, lineEndIdx + 1) + insert + c.substring(lineEndIdx + 1);
fs.writeFileSync('public/app.js', c);
console.log('Done');