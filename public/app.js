const { useState, useEffect } = React;
const h = React.createElement;
const COMPANY_LOGO_URL = '/images/Reyadah_Logo.png';
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1).toLocaleString('en-US', { month: 'long' }));
const ATTENDANCE_LEGEND_ITEMS = [
  { code: 'P', label: 'Present', className: 'present' },
  { code: 'A', label: 'Absent', className: 'absent' },
  { code: 'O', label: 'Holiday / weekly off', className: 'holiday' },
  { code: 'FD', label: 'Full day', className: 'full-day' },
  { code: 'HD', label: 'Half day', className: 'half-day' },
  { code: 'NS', label: 'Not marked', className: 'not-marked' },
];

function apiRequest(path, token, options = {}) {
  const headers = options.headers || {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(path, { ...options, headers }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw json;
    return json;
  });
}

function NavButton({ label, icon, count, active, onClick }) {
  return h('button', {
    className: active ? 'nav-item active' : 'nav-item',
    onClick,
  }, [
    icon && h('span', { className: 'nav-icon' }, icon),
    h('span', { className: 'nav-label' }, label),
    Number.isFinite(count) && count > 0 && h('span', { className: 'nav-count' }, count),
  ]);
}

function StatTile({ label, value, variant, active, hint }) {
  return h('div', { className: `stat-tile ${variant} ${active ? 'animated' : ''}` }, [
    h('span', { className: `stat-value ${active ? 'animated' : ''}` }, value),
    h('span', { className: 'stat-label' }, label),
    hint && h('span', { className: 'stat-hint' }, hint),
  ]);
}

function EmptyState({ title, message, actionLabel, onAction }) {
  return h('div', { className: 'empty-state' }, [
    h('strong', null, title),
    h('p', { className: 'muted' }, message),
    actionLabel && h('button', { className: 'btn secondary small', onClick: onAction }, actionLabel),
  ]);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `AED ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatRole(role) {
  return String(role || 'employee').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatAttendanceMonth(year, month) {
  const monthName = MONTH_NAMES[Math.max(0, Math.min(11, Number(month || 1) - 1))] || 'Month';
  return `${monthName} ${year || ''}`.trim();
}

function formatAttendanceTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatAttendanceMinutes(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours && !mins) return '0h';
  if (!mins) return `${hours}h`;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function attendanceStatusClass(status) {
  if (status === 'p') return 'present';
  if (status === 'a') return 'absent';
  if (status === 'o') return 'holiday';
  return 'not-marked';
}

function attendanceWorkTypeClass(workType) {
  const normalized = String(workType || '').toLowerCase().replace(/\s+/g, '-');
  return normalized || 'not-marked';
}

function initialsFrom(name, fallback = '?') {
  return String(name || fallback)
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function hasAssignedShift(employee) {
  return Boolean(employee && employee.shiftRoster && employee.shiftRoster.shiftName);
}

function isTeamRole(role) {
  return ['admin', 'restaurant-manager', 'company-manager'].includes(role);
}

function isPayrollManager(role) {
  return role === 'admin' || role === 'company-manager';
}

// Toast notification system
function useToast() {
  const [toasts, setToasts] = React.useState([]);
  const addToast = React.useCallback((message, type) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type: type || 'success' }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);
  const removeToast = React.useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  return { toasts, addToast, removeToast };
}

function ToastContainer({ toasts, removeToast }) {
  if (!toasts || !toasts.length) return null;
  return h('div', { className: 'toast-container' },
    toasts.map(toast => h('div', { key: toast.id, className: `toast-item ${toast.type}` }, [
      h('span', null, toast.message),
      h('button', { className: 'toast-close', onClick: () => removeToast(toast.id) }, '×'),
    ]))
  );
}

// ==================== AI Chatbot Widget ====================
function AiChatWidget({ token, user }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [ticketMode, setTicketMode] = React.useState(false);
  const [ticketForm, setTicketForm] = React.useState({ subject: '', description: '', category: 'technical', priority: 'medium' });
  const chatRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // Add welcome message when opened for the first time
  React.useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'bot',
        text: `Hi ${user?.name || 'there'}! 👋 I'm your **HR Assistant**. Ask me about your attendance, leave, payslips, or anything HR-related!`,
        quickReplies: ['My attendance', 'Leave balance', 'My profile', 'Help', 'Raise a ticket 🎫']
      }]);
    }
  }, [open]);

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when chat opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function sendMessage(msg) {
    const text = (msg || input).trim();
    if (!text || busy) return;

    // Check if user wants to raise a ticket
    const lowerText = text.toLowerCase();
    if (lowerText.includes('raise a ticket') || lowerText.includes('raise ticket') || lowerText === 'raise a ticket 🎫') {
      setTicketMode(true);
      setMessages(prev => [...prev, { role: 'user', text }]);
      setMessages(prev => [...prev, { role: 'bot', text: 'Please describe your issue below and click **Submit Ticket**.' }]);
      setInput('');
      return;
    }

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/ai-bot/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'bot', text: data.error || 'Sorry, something went wrong.' }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'bot', 
          text: data.reply,
          quickReplies: data.quickReplies || [],
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, I could not reach the server. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function submitTicketFromChat() {
    if (!ticketForm.subject || !ticketForm.description) return;
    setBusy(true);
    try {
      await apiRequest('/api/requests/tickets', token, {
        method: 'POST',
        body: JSON.stringify({
          subject: ticketForm.subject,
          category: ticketForm.category || 'technical',
          description: ticketForm.description,
          priority: ticketForm.priority || 'medium',
        }),
      });
      setMessages(prev => [...prev, { role: 'bot', text: '✅ Your ticket has been submitted successfully! An admin will review it shortly.' }]);
      setTicketMode(false);
      setTicketForm({ subject: '', description: '', category: 'technical', priority: 'medium' });
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: '❌ Failed to submit ticket: ' + (err.error || 'Please try again.') }]);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleQuickReply(reply) {
    sendMessage(reply);
  }

  if (!token || !user) return null;

  return h('div', { className: 'ai-chat-widget' }, [
    // Chat bubble button
    h('button', {
      className: `ai-chat-toggle ${open ? 'active' : ''}`,
      onClick: () => setOpen(prev => !prev),
      title: 'HR Assistant',
    }, open ? '✕' : '🤖'),

    // Chat panel
    open && h('div', { className: 'ai-chat-panel' }, [
      // Header
      h('div', { className: 'ai-chat-header' }, [
        h('div', { className: 'ai-chat-header-info' }, [
          h('span', { className: 'ai-chat-avatar' }, '🤖'),
          h('div', null, [
            h('strong', null, 'HR Assistant'),
            h('span', { className: 'ai-chat-status' }, 'Online'),
          ]),
        ]),
        h('button', {
          className: 'ai-chat-close',
          onClick: () => setOpen(false),
        }, '✕'),
      ]),

      // Messages
      h('div', { className: 'ai-chat-messages', ref: chatRef }, [
        ...messages.map((msg, i) => h('div', {
          key: i,
          className: `ai-chat-msg ${msg.role === 'user' ? 'user' : 'bot'}`,
        }, [
          msg.role === 'bot' && h('span', { className: 'ai-chat-msg-avatar' }, '🤖'),
          h('div', { className: 'ai-chat-bubble' }, [
            h('div', { className: 'ai-chat-text' }, formatBotMessage(msg.text)),
            msg.quickReplies && msg.quickReplies.length > 0 && h('div', { className: 'ai-chat-quick-replies' },
              msg.quickReplies.map((qr, qi) => h('button', {
                key: qi,
                className: 'ai-chat-quick-btn',
                onClick: () => handleQuickReply(qr),
                disabled: busy,
              }, qr))
            ),
          ]),
        ])),
        busy && h('div', { className: 'ai-chat-msg bot' }, [
          h('span', { className: 'ai-chat-msg-avatar' }, '🤖'),
          h('div', { className: 'ai-chat-bubble' }, [
            h('div', { className: 'ai-chat-typing' }, [
              h('span', { className: 'typing-dot' }),
              h('span', { className: 'typing-dot' }),
              h('span', { className: 'typing-dot' }),
            ]),
          ]),
        ]),
      ]),

      // Ticket form (shown when ticketMode is true)
      ticketMode && h('div', { className: 'ai-chat-ticket-form', style: { padding: '12px', borderTop: '1px solid var(--border)', background: 'var(--accent-soft)' } }, [
        h('strong', { style: { display: 'block', marginBottom: '8px', fontSize: '13px' } }, '🎫 Raise a Ticket'),
        h('input', {
          value: ticketForm.subject,
          onChange: (e) => setTicketForm(prev => ({ ...prev, subject: e.target.value })),
          placeholder: 'Subject (e.g. Attendance issue)',
          style: { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '6px', fontSize: '12px', boxSizing: 'border-box' },
        }),
        h('select', {
          value: ticketForm.category,
          onChange: (e) => setTicketForm(prev => ({ ...prev, category: e.target.value })),
          style: { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '6px', fontSize: '12px' },
        }, [
          h('option', { value: 'technical' }, 'Technical Issue'),
          h('option', { value: 'attendance' }, 'Attendance Correction'),
          h('option', { value: 'work-from-home' }, 'Work From Home'),
          h('option', { value: 'shift-change' }, 'Shift Change'),
          h('option', { value: 'hr' }, 'HR Query'),
          h('option', { value: 'other' }, 'Other'),
        ]),
        h('textarea', {
          value: ticketForm.description,
          onChange: (e) => setTicketForm(prev => ({ ...prev, description: e.target.value })),
          placeholder: 'Describe your issue in detail...',
          rows: 3,
          style: { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' },
        }),
        h('div', { style: { display: 'flex', gap: '6px' } }, [
          h('button', {
            className: 'btn primary small',
            onClick: submitTicketFromChat,
            disabled: busy || !ticketForm.subject || !ticketForm.description,
            style: { flex: 1, padding: '8px', fontSize: '12px', cursor: busy || !ticketForm.subject || !ticketForm.description ? 'not-allowed' : 'pointer' },
          }, busy ? 'Submitting...' : '✅ Submit Ticket'),
          h('button', {
            className: 'btn white small',
            onClick: () => { setTicketMode(false); setTicketForm({ subject: '', description: '', category: 'technical', priority: 'medium' }); },
            style: { padding: '8px', fontSize: '12px', cursor: 'pointer' },
          }, 'Cancel'),
        ]),
      ]),

      // Input area
      h('div', { className: 'ai-chat-input-area' }, [
        h('input', {
          ref: inputRef,
          className: 'ai-chat-input',
          type: 'text',
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: handleKeyDown,
          placeholder: ticketMode ? 'Fill the form above...' : 'Ask me anything...',
          disabled: busy,
        }),
        h('button', {
          className: 'ai-chat-send',
          onClick: () => sendMessage(),
          disabled: busy || !input.trim(),
        }, '➤'),
      ]),
    ]),
  ]);
}

// Simple markdown-like formatting for bot messages (bold, line breaks)
function formatBotMessage(text) {
  if (!text) return null;
  // Split by newlines to create paragraphs
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Handle bold (**text**)
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formatted = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return h('strong', { key: j }, part.slice(2, -2));
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return h('code', { key: j }, part.slice(1, -1));
      }
      return part;
    });
    return h('p', { key: i, className: 'ai-chat-line' }, formatted);
  });
}

function ProfileScoreCard({ employee }) {
  if (!employee) return null;
  const checks = [
    { label: 'Employee ID', done: Boolean(employee.employeeId) },
    { label: 'Full name', done: Boolean(employee.name) },
    { label: 'Email address', done: Boolean(employee.email) },
    { label: 'Designation', done: Boolean(employee.designation) },
    { label: 'Photo uploaded', done: Boolean(employee.photoUrl) },
    { label: 'Shift assigned', done: Boolean(employee.shiftRoster?.shiftName) },
  ];
  const score = Math.round((checks.filter(c => c.done).length / checks.length) * 100);
  return h('div', { className: 'profile-score-card' }, [
    h('div', { className: 'profile-score-header' }, [
      h('strong', null, 'Profile Completion'),
      h('span', { className: 'profile-score-value' }, `${score}%`),
    ]),
    h('div', { className: 'profile-score-bar' }, [
      h('div', { className: 'profile-score-fill', style: { width: `${score}%` } }),
    ]),
    h('div', { className: 'profile-score-items' },
      checks.map((c, i) => h('div', { key: i, className: 'profile-score-item' }, [
        h('span', { className: c.done ? 'check' : 'cross' }, c.done ? '✓' : '✗'),
        h('span', null, c.label),
      ]))
    ),
  ]);
}

// Camera capture component for selfie-based attendance
function CameraCapture({ onCapture, onClose, type }) {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [stream, setStream] = React.useState(null);
  const [captured, setCaptured] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setError('');
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions or use a device with a camera.');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 300);

    // Get the captured image as blob
    canvas.toBlob((blob) => {
      if (blob) {
        setCaptured(blob);
      }
    }, 'image/jpeg', 0.85);
  }

  function retake() {
    setCaptured(null);
  }

  function confirmAndSubmit() {
    if (!captured) return;
    setBusy(true);
    onCapture(captured);
  }

  return h('div', { className: 'camera-overlay' }, [
    h('div', { className: 'camera-modal' }, [
      h('div', { className: 'camera-header' }, [
        h('h3', null, type === 'clockIn' ? '📸 Clock-In Selfie' : '📸 Clock-Out Selfie'),
        h('p', { className: 'muted' }, 'Please take a clear selfie to verify your identity'),
      ]),

      error ? h('div', { className: 'camera-error' }, [
        h('p', { className: 'error-text' }, error),
        h('button', { className: 'btn primary', onClick: startCamera }, 'Try Again'),
      ]) : null,

      h('div', { className: 'camera-viewfinder' }, [
        !captured ? h('video', {
          ref: videoRef,
          className: 'camera-video',
          autoPlay: true,
          playsInline: true,
          muted: true,
        }) : null,

        h('canvas', {
          ref: canvasRef,
          className: 'camera-canvas',
          style: { display: 'none' },
        }),

        captured ? h('img', {
          src: URL.createObjectURL(captured),
          className: 'camera-preview',
          alt: 'Captured selfie',
          style: { width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius)' },
        }) : null,

        flash ? h('div', { className: 'camera-flash' }) : null,
      ]),

      h('div', { className: 'camera-face-guide', dangerouslySetInnerHTML: { __html: '👤' } }),

      h('div', { className: 'camera-actions' }, [
        !captured ? [
          h('button', {
            key: 'capture',
            className: 'btn primary camera-capture-btn',
            onClick: capture,
            disabled: !!error || !stream,
          }, '📸 Take Photo'),
        ] : [
          h('button', {
            key: 'retake',
            className: 'btn secondary',
            onClick: retake,
            disabled: busy,
          }, '🔄 Retake'),
          h('button', {
            key: 'confirm',
            className: 'btn primary',
            onClick: confirmAndSubmit,
            disabled: busy,
          }, busy ? 'Submitting...' : '✅ Confirm & Submit'),
        ],
      ]),

      h('button', {
        className: 'camera-close-btn',
        onClick: onClose,
        disabled: busy,
      }, '✕ Cancel'),
    ]),
  ]);
}

function App() {
  const { toasts, addToast, removeToast } = useToast();
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem('reyadahTheme') === 'dark');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraType, setCameraType] = useState(null); // 'clockIn' or 'clockOut'
  const [cameraBusy, setCameraBusy] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('reyadahToken') || null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('home');
  const [loginState, setLoginState] = useState({ employeeId: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [message, setMessage] = useState('');
  const [homeActive, setHomeActive] = useState(false);
  const [companyLogoVersion, setCompanyLogoVersion] = useState(Date.now());
  const [docs, setDocs] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [teamPayslips, setTeamPayslips] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceInfoYear, setAttendanceInfoYear] = useState(new Date().getFullYear());
  const [attendanceInfoMonth, setAttendanceInfoMonth] = useState(new Date().getMonth() + 1);
  const [attendanceInfoReport, setAttendanceInfoReport] = useState(null);
  const [attendanceInfoLoading, setAttendanceInfoLoading] = useState(false);
  const [attendanceInfoSearch, setAttendanceInfoSearch] = useState('');
  const [attendanceInfoLookupQuery, setAttendanceInfoLookupQuery] = useState('');
  const [attendanceInfoLookupResults, setAttendanceInfoLookupResults] = useState([]);
  const [attendanceInfoLookupBusy, setAttendanceInfoLookupBusy] = useState(false);
  // Company section state
  const [companyTab, setCompanyTab] = useState('employees');
  const [companyData, setCompanyData] = useState(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [companyLookupEmpId, setCompanyLookupEmpId] = useState('');
  const [companyLookupDocs, setCompanyLookupDocs] = useState(null);
  const [companyLookupBusy, setCompanyLookupBusy] = useState(false);
  const [companyDocUpload, setCompanyDocUpload] = useState({ open: false, employeeId: '', docType: '', description: '', file: null });
  const [empDocUpload, setEmpDocUpload] = useState({ open: false, docType: '', description: '', file: null });

  const [attendanceInfoLookupSelectedEmployee, setAttendanceInfoLookupSelectedEmployee] = useState(null);
  const [attendanceInfoLookupMonthData, setAttendanceInfoLookupMonthData] = useState(null);
  // Payroll-specific state (separate from attendance info to avoid overlap)
  const [payrollSearchQuery, setPayrollSearchQuery] = useState('');
  const [payrollSearchResults, setPayrollSearchResults] = useState([]);
  const [payrollNotes, setPayrollNotes] = useState('');
  const [payrollSearchBusy, setPayrollSearchBusy] = useState(false);
  const [attendanceInfoStatusFilter, setAttendanceInfoStatusFilter] = useState('all');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeDetails, setSelectedEmployeeDetails] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [attendanceEditorYear, setAttendanceEditorYear] = useState(new Date().getFullYear());
  const [attendanceEditorMonth, setAttendanceEditorMonth] = useState(new Date().getMonth() + 1);
  const [attendanceEditorDays, setAttendanceEditorDays] = useState([]);
  const [attendanceBulkStatus, setAttendanceBulkStatus] = useState('');
  const [attendanceSelectedDate, setAttendanceSelectedDate] = useState(null);
  const [editEmployeeId, setEditEmployeeId] = useState(null);
  const [adminTeamPage, setAdminTeamPage] = useState(1);
  const [newAsset, setNewAsset] = useState({ name: '', serialNumber: '', assetType: '', model: '', description: '', price: '', purchaseDate: '', status: 'available' });
  const [newEmployee, setNewEmployee] = useState({ employeeId: '', name: '', email: '', designation: '', salary: '', password: '', role: 'employee' });
  const [employeePhotoFile, setEmployeePhotoFile] = useState(null);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkCredentials, setBulkCredentials] = useState([]);
  const [bulkDownloadBusy, setBulkDownloadBusy] = useState(false);
  const [bulkPhotoFiles, setBulkPhotoFiles] = useState([]);
  const [bulkPhotoBusy, setBulkPhotoBusy] = useState(false);
  const [bulkPhotoResult, setBulkPhotoResult] = useState(null);
  const [bulkAssetFile, setBulkAssetFile] = useState(null);
  const [bulkAssetBusy, setBulkAssetBusy] = useState(false);
  const [bulkAssetResult, setBulkAssetResult] = useState(null);
  const [bulkPhFile, setBulkPhFile] = useState(null);
  const [bulkPhBusy, setBulkPhBusy] = useState(false);
  const [bulkAnnualLeaveFile, setBulkAnnualLeaveFile] = useState(null);
  const [bulkAnnualLeaveBusy, setBulkAnnualLeaveBusy] = useState(false);
  const [documentMeta, setDocumentMeta] = useState({ docType: '', description: '', issueDate: '', expiryDate: '' });
  const [employeeDocMeta, setEmployeeDocMeta] = useState({ docType: '', description: '', issueDate: '', expiryDate: '' });
  const [employeeDocFile, setEmployeeDocFile] = useState(null);
  // Profile document upload (employee's own profile)
  const [profileDocMeta, setProfileDocMeta] = useState({ docType: '', description: '', issueDate: '', expiryDate: '' });
  const [profileDocFile, setProfileDocFile] = useState(null);
  // Profile asset add form (admin employee profile)
  const [profileAssetForm, setProfileAssetForm] = useState({ showForm: false, name: '', serialNumber: '', assetType: '', model: '', description: '' });
  const [profileAssetBusy, setProfileAssetBusy] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveBalanceBusy, setLeaveBalanceBusy] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
  const [leaveDecisionNotes, setLeaveDecisionNotes] = useState({});
  const [adminPage, setAdminPage] = useState('team');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [employeeShift, setEmployeeShift] = useState({ shiftName: '', startTime: '', endTime: '', notes: '' });
  const [payrollRequest, setPayrollRequest] = useState(() => {
    const now = new Date();
    return { employeeId: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
  });
  const [rosterMatrix, setRosterMatrix] = useState({});
  const [celebrations, setCelebrations] = useState(null);
  // ZKTeco device management state
  const [zktecoDevices, setZktecoDevices] = useState([]);
  const [zktecoPage, setZktecoPage] = useState('list'); // list, add, edit, sync, logs, mapping, geofence
  const [zktecoSelectedDevice, setZktecoSelectedDevice] = useState(null);
  const [zktecoSyncing, setZktecoSyncing] = useState(false);
  const [zktecoSyncLogs, setZktecoSyncLogs] = useState([]);
  const [zktecoMappingText, setZktecoMappingText] = useState('');
  const [zktecoForm, setZktecoForm] = useState({ name: '', ipAddress: '', port: 4370, location: '', outletName: '', serialNumber: '', autoSync: true, syncInterval: 5 });
  const [zktecoEditForm, setZktecoEditForm] = useState({ name: '', ipAddress: '', port: 4370, location: '', outletName: '', serialNumber: '', isActive: true });
  const [zktecoGeofenceForm, setZktecoGeofenceForm] = useState({ enabled: false, latitude: '', longitude: '', radius: 100 });
  // Employee Leave Management state
  const [empLeaveSearch, setEmpLeaveSearch] = useState('');
  const [empLeaveSelectedId, setEmpLeaveSelectedId] = useState('');
  const [empLeaveData, setEmpLeaveData] = useState(null);
  const [empLeaveBusy, setEmpLeaveBusy] = useState(false);
  const [empLeaveEntitlements, setEmpLeaveEntitlements] = useState({});
  // Apply Leave on Behalf state
  const [applyLeaveForm, setApplyLeaveForm] = useState({ employeeId: '', leaveType: 'PH', startDate: '', endDate: '', reason: '', autoApprove: true });
  const [applyLeaveBusy, setApplyLeaveBusy] = useState(false);
  const [applyLeaveSearch, setApplyLeaveSearch] = useState('');
  const [applyLeaveResults, setApplyLeaveResults] = useState([]);
  const [applyLeaveSearchBusy, setApplyLeaveSearchBusy] = useState(false);
  const [applyLeaveSelectedEmp, setApplyLeaveSelectedEmp] = useState(null);
  // Request Hub state
  const [reqTab, setReqTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [ticketForm, setTicketForm] = useState({ subject: '', category: 'attendance', description: '', priority: 'medium' });
  const [expenses, setExpenses] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'other', description: '', expenseDate: '' });
  const [expenseFile, setExpenseFile] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loanForm, setLoanForm] = useState({ amount: '', purpose: '', totalInstallments: 3 });
  const [medicalReimbursements, setMedicalReimbursements] = useState([]);
  const [medicalForm, setMedicalForm] = useState({ amount: '', medicalType: 'consultation', description: '', hospitalName: '', expenseDate: '' });
  const [medicalFile, setMedicalFile] = useState(null);
  const [airTickets, setAirTickets] = useState([]);
  const [airTicketForm, setAirTicketForm] = useState({ amount: '', ticketType: 'domestic', purpose: '', departureCity: '', destinationCity: '', airline: '', ticketNumber: '', departureDate: '', returnDate: '' });
  const [airTicketFile, setAirTicketFile] = useState(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [leaveBalancePage, setLeaveBalancePage] = useState(0);
  const LEAVE_BALANCE_PAGE_SIZE = 10;
  // New admin section states
  const [departments, setDepartments] = useState([]);
  const [newDepartment, setNewDepartment] = useState('');
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '', type: 'public' });
  const [auditLogs, setAuditLogs] = useState([]);
  const [reportsData, setReportsData] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportType, setReportType] = useState('attendance');
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  // EOS (End of Service) state
  const [eosSearchQuery, setEosSearchQuery] = useState('');
  const [eosSearchResults, setEosSearchResults] = useState([]);
  const [eosSearchBusy, setEosSearchBusy] = useState(false);
  const [eosSelectedEmployee, setEosSelectedEmployee] = useState(null);
  const [eosData, setEosData] = useState(null);
  const [eosBusy, setEosBusy] = useState(false);
  const [eosForm, setEosForm] = useState({ companyName: 'REYADAH HR', eosAmount: '', annualLeaveAmount: '', phLeaveAmount: '', monthlyPay: '', otherAllowances: '', deductions: '', notes: '', endDate: new Date().toISOString().split('T')[0] });
  const [eosPdfBusy, setEosPdfBusy] = useState(false);
  const [eosTemplateExists, setEosTemplateExists] = useState(false);
  const [eosTemplateInfo, setEosTemplateInfo] = useState(null);
  const [eosTemplateUploadBusy, setEosTemplateUploadBusy] = useState(false);
  const [eosCompanies, setEosCompanies] = useState([]);
  const [biometricDevices, setBiometricDevices] = useState([]);
  const [testApiKey, setTestApiKey] = useState('');
  const [testEmployeeId, setTestEmployeeId] = useState('');
  const [testClockIn, setTestClockIn] = useState(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return today + 'T08:00';
  });
  const [testClockOut, setTestClockOut] = useState(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return today + 'T17:00';
  });
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const companyLogoSrc = `${COMPANY_LOGO_URL}?v=${companyLogoVersion}`;

  // Collapsible sidebar sections state
  const [expandedSections, setExpandedSections] = React.useState({ home: true, tasks: false, payroll: false, leave: false, attendance: false, employees: false });

  // section-level permissions — list roles that can view each section
  const sectionPermissions = {
    home: ['employee','restaurant-manager','company-manager','admin'],
    profile: ['employee','restaurant-manager','company-manager','admin'],
    tasks: ['employee','restaurant-manager','company-manager','admin'],
    payroll: ['admin','company-manager'],
    payslips: ['employee','restaurant-manager','company-manager','admin'],
    leave: ['employee','restaurant-manager','company-manager','admin'],
    'leave-approvals': ['restaurant-manager','company-manager','admin'],
    attendance: ['employee','restaurant-manager','company-manager','admin'],
    'attendance-info': ['restaurant-manager','company-manager','admin'],
    'attendance-editor': ['restaurant-manager','company-manager','admin'],
    hiring: ['admin'],
    expenses: ['employee','restaurant-manager','company-manager','admin'],
    documents: ['employee','restaurant-manager','company-manager','admin'],
    requests: ['employee','restaurant-manager','company-manager','admin'],
    delegates: ['admin'],
    admin: ['admin'],
    company: ['admin'],
    'shift-roster': ['admin','restaurant-manager','company-manager'],
    'employees-section': ['admin','company-manager','restaurant-manager'],
  };

  function canView(section) {
    if (!user) return false;
    const allowed = sectionPermissions[section];
    if (!allowed) return true;
    return allowed.includes(user.role);
  }

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkTheme ? 'dark' : 'light');
    localStorage.setItem('reyadahTheme', darkTheme ? 'dark' : 'light');
  }, [darkTheme]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('reyadahToken', token);
      loadProfile();
      loadDocs();
      loadPayslips();
      loadAttendance();
      if (user && isTeamRole(user.role)) loadEmployees();
      loadLeaves();
    } else {
      localStorage.removeItem('reyadahToken');
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (user && isTeamRole(user.role)) {
      loadEmployees();
    }
    if (user) {
      loadLeaves();
    }
  }, [user]);

  useEffect(() => {
    if (user && token) {
      loadCelebrations();
    }
  }, [user, token]);

  useEffect(() => {
    setHomeActive(tab === 'home');
  }, [tab]);

  useEffect(() => {
    if (user) {
      loadPayslips();
      loadAttendance();
    }
  }, [user]);

  useEffect(() => {
    if (!token || !user || !canView('attendance-info') || tab !== 'attendance-info') return;
    loadAttendanceInfo(attendanceInfoYear, attendanceInfoMonth);
  }, [token, user, tab]);

  useEffect(() => {
    if (!user || !isPayrollManager(user.role) || payrollRequest.employeeId || !employees.length) return;
    setPayrollRequest((prev) => ({ ...prev, employeeId: employees[0].employeeId }));
  }, [user, employees, payrollRequest.employeeId]);

  useEffect(() => {
    if (!user || !isPayrollManager(user.role) || !payrollRequest.employeeId) return;
    loadPayrollForEmployee(payrollRequest.employeeId);
  }, [user, payrollRequest.employeeId]);

  useEffect(() => {
    if (!token || !user || user.role !== 'admin' || adminPage !== 'leaveBalances') return;
    loadLeaveBalances();
  }, [token, user, adminPage]);

  useEffect(() => {
    if (!token || !user || user.role !== 'admin' || adminPage !== 'holidays') return;
    loadHolidays();
  }, [token, user, adminPage]);

  useEffect(() => {
    if (!token || !user || user.role !== 'admin' || adminPage !== 'eos') return;
    // Load template status
    (async () => {
      try {
        const res = await fetch('/api/eos/template-status', {
          headers: { 'Authorization': 'Bearer ' + token },
        });
        if (res.ok) {
          const data = await res.json();
          setEosTemplateExists(data.exists);
          setEosTemplateInfo(data.stats);
        }
      } catch (err) {}
    })();
  }, [token, user, adminPage]);

  async function loadProfile() {
    try {
      const profile = await apiRequest('/api/employees/me', token);
      setUser(profile);
    } catch (err) {
      setMessage(err.error || 'Failed to load profile');
    }
  }

  async function loadDocs() {
    if (!token) return;
    try {
      const list = await apiRequest('/api/documents/me', token);
      setDocs(Array.isArray(list) ? list : []);
    } catch (err) {
      setDocs([]);
    }
  }

  async function loadPayslips() {
    if (!token || !user) return;
    try {
      const data = await apiRequest(`/api/payroll/${user.employeeId}`, token);
      // API returns { employee, payrolls, activeLoans, pendingExpenses, summary }
      setPayslips(Array.isArray(data.payrolls) ? data.payrolls : []);
    } catch (err) {
      setPayslips([]);
    }
  }

  async function loadPayrollForEmployee(employeeId) {
    if (!token || !employeeId) return;
    try {
      const data = await apiRequest(`/api/payroll/${employeeId}`, token);
      // API returns { employee, payrolls, activeLoans, pendingExpenses, summary }
      setTeamPayslips(Array.isArray(data.payrolls) ? data.payrolls : []);
    } catch (err) {
      setTeamPayslips([]);
      setMessage(err.error || 'Failed to load payroll records');
    }
  }

  async function loadAttendance() {
    if (!token || !user) return;
    try {
      const records = await apiRequest('/api/attendance/me', token);
      setAttendanceRecords(Array.isArray(records) ? records : []);
    } catch (err) {
      setAttendanceRecords([]);
    }
  }

  async function loadAttendanceInfo(year = attendanceInfoYear, month = attendanceInfoMonth) {
    if (!token || !user || !canView('attendance-info')) return;
    const safeYear = parseInt(year, 10) || new Date().getFullYear();
    const safeMonth = Math.min(12, Math.max(1, parseInt(month, 10) || 1));
    setAttendanceInfoLoading(true);
    try {
      const report = await apiRequest(`/api/attendance/month/${safeYear}/${safeMonth}`, token);
      setAttendanceInfoReport(report);
      setAttendanceInfoYear(report.year || safeYear);
      setAttendanceInfoMonth(report.month || safeMonth);
    } catch (err) {
      setAttendanceInfoReport(null);
      setMessage(err.error || 'Failed to load attendance information');
    } finally {
      setAttendanceInfoLoading(false);
    }
  }

  async function moveAttendanceInfoMonth(offset) {
    const next = new Date(attendanceInfoYear, attendanceInfoMonth - 1 + offset, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth() + 1;
    setAttendanceInfoYear(nextYear);
    setAttendanceInfoMonth(nextMonth);
    await loadAttendanceInfo(nextYear, nextMonth);
  }

  async function searchAttendanceEmployee(query) {
    if (!token || !query || query.length < 1) {
      setAttendanceInfoLookupResults([]);
      return;
    }
    setAttendanceInfoLookupBusy(true);
    try {
      const results = await apiRequest(`/api/employees/search/query?q=${encodeURIComponent(query)}`, token);
      setAttendanceInfoLookupResults(Array.isArray(results) ? results : []);
    } catch (err) {
      setAttendanceInfoLookupResults([]);
    } finally {
      setAttendanceInfoLookupBusy(false);
    }
  }

  async function loadAttendanceLookupForEmployee(employeeId, year, month) {
    if (!token || !employeeId) return;
    try {
      const data = await apiRequest(`/api/attendance/employee/${employeeId}/month/${year}/${month}`, token);
      setAttendanceInfoLookupMonthData(data);
    } catch (err) {
      setAttendanceInfoLookupMonthData(null);
      setMessage(err.error || 'Failed to load employee attendance');
    }
  }

  async function loadEmployees() {
    if (!token) return;
    try {
      const list = await apiRequest('/api/employees', token);
      setEmployees(Array.isArray(list) ? list : []);
    } catch (err) {
      setEmployees([]);
    }
  }

  async function loadEmployeeDetails(employeeId) {
    if (!token) {
      setMessage('Authentication required. Please log in again.');
      return;
    }
    if (!employeeId) {
      setMessage('Invalid employee selected.');
      return;
    }
    try {
      const details = await apiRequest(`/api/employees/${employeeId}`, token);
      setSelectedEmployeeDetails(details);
      setSelectedEmployeeId(employeeId);
      setEmployeeShift({
        shiftName: details.shiftRoster?.shiftName || '',
        startTime: details.shiftRoster?.startTime || '',
        endTime: details.shiftRoster?.endTime || '',
        notes: details.shiftRoster?.notes || '',
      });
      // load monthly attendance for current month for managers/admin
      if (user && (user.role === 'admin' || user.role === 'restaurant-manager' || user.role === 'company-manager')) {
        const y = attendanceEditorYear;
        const m = attendanceEditorMonth;
        await loadEmployeeMonthlyAttendance(employeeId, y, m);
      }
    } catch (err) {
      setMessage(err.error || err.message || JSON.stringify(err) || 'Failed to load employee details');
    }
  }

  async function assignAsset() {
    if (!token || !selectedEmployeeId) return;
    try {
      const payload = {
        name: newAsset.name,
        serialNumber: newAsset.serialNumber,
        assetType: newAsset.assetType,
        model: newAsset.model,
        description: newAsset.description,
        status: newAsset.status || 'assigned',
      };
      await apiRequest(`/api/employees/${selectedEmployeeId}/assets`, token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('Asset assigned successfully');
      setNewAsset({ name: '', serialNumber: '', assetType: '', model: '', description: '', status: '' });
      await loadEmployeeDetails(selectedEmployeeId);
    } catch (err) {
      setMessage(err.error || 'Failed to assign asset');
    }
  }

  async function signIn() {
    setMessage('');
    if (!loginState.employeeId || !loginState.password) {
      setMessage('Please enter your Employee ID and password');
      return;
    }
    setLoginBusy(true);
    try {
      const data = await apiRequest('/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify(loginState),
      });
      setToken(data.token);
      // Show loading animation while dashboard loads
      setLoadingDashboard(true);
      setTab('home');
      // Simulate minimum loading time for smooth animation
      setTimeout(() => {
        setLoadingDashboard(false);
      }, 1500);
    } catch (err) {
      setMessage(err.error || 'Login failed');
      setLoginBusy(false);
    }
  }

  function handleLoginKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      signIn();
    }
  }

  // Open camera for selfie-based clock in/out
  function openCameraForClock(type) {
    setCameraType(type);
    setCameraOpen(true);
  }

  // Handle captured selfie from CameraCapture component
  async function handleSelfieCapture(capturedBlob) {
    if (!capturedBlob || !cameraType) {
      setCameraBusy(false);
      return;
    }
    setCameraBusy(true);
    try {
      const formData = new FormData();
      formData.append('selfie', capturedBlob, `selfie_${Date.now()}.jpg`);
      
      const path = cameraType === 'clockIn' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';
      const result = await apiRequest(path, token, { method: 'POST', body: formData });
      
      setCameraOpen(false);
      setCameraType(null);
      setCameraBusy(false);
      addToast(result.error ? result.error : 'Attendance recorded with selfie verification', result.error ? 'error' : 'success');
      await loadAttendance();
      await loadProfile();
    } catch (err) {
      setCameraOpen(false);
      setCameraType(null);
      setCameraBusy(false);
      addToast(err.error || 'Attendance failed. Please try again.', 'error');
    }
  }

  // Direct clock action without camera (fallback)
  async function clockAction(path) {
    // Use camera for clock-in/out instead
    if (path === '/api/attendance/clock-in' || path === '/api/attendance/clock-out') {
      openCameraForClock(path.includes('clock-in') ? 'clockIn' : 'clockOut');
      return;
    }
    try {
      const result = await apiRequest(path, token, { method: 'POST' });
      addToast(result.error ? result.error : 'Action completed successfully', result.error ? 'error' : 'success');
      await loadAttendance();
      await loadProfile();
    } catch (err) {
      addToast(err.error || 'Action failed', 'error');
    }
  }

  async function uploadDocument(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('docType', documentMeta.docType || 'General');
    form.append('description', documentMeta.description || '');
    form.append('issueDate', documentMeta.issueDate || '');
    form.append('expiryDate', documentMeta.expiryDate || '');
    try {
      await apiRequest('/api/documents/upload', token, { method: 'POST', body: form });
      await loadDocs();
      setDocumentMeta({ docType: '', description: '', issueDate: '', expiryDate: '' });
      setMessage('Document uploaded successfully');
    } catch (err) {
      setMessage(err.error || 'Upload failed');
    }
  }

  async function uploadEmployeeDocument() {
    if (!token || !selectedEmployeeId || !employeeDocFile) return;
    const form = new FormData();
    form.append('file', employeeDocFile);
    form.append('docType', employeeDocMeta.docType || 'General');
    form.append('description', employeeDocMeta.description || '');
    form.append('issueDate', employeeDocMeta.issueDate || '');
    form.append('expiryDate', employeeDocMeta.expiryDate || '');
    try {
      await apiRequest(`/api/employees/${selectedEmployeeId}/documents`, token, { method: 'POST', body: form });
      setEmployeeDocFile(null);
      setEmployeeDocMeta({ docType: '', description: '', issueDate: '', expiryDate: '' });
      await loadEmployeeDetails(selectedEmployeeId);
      setMessage('Document added to employee profile');
    } catch (err) {
      setMessage(err.error || 'Failed to upload employee document');
    }
  }

  async function uploadProfileDocument() {
    if (!token || !profileDocFile) return;
    const form = new FormData();
    form.append('file', profileDocFile);
    form.append('docType', profileDocMeta.docType || 'General');
    form.append('description', profileDocMeta.description || '');
    form.append('issueDate', profileDocMeta.issueDate || '');
    form.append('expiryDate', profileDocMeta.expiryDate || '');
    try {
      await apiRequest('/api/documents/upload', token, { method: 'POST', body: form });
      setProfileDocFile(null);
      setProfileDocMeta({ docType: '', description: '', issueDate: '', expiryDate: '' });
      await loadProfile();
      setMessage('Document added to your profile');
    } catch (err) {
      setMessage(err.error || 'Failed to upload document');
    }
  }

  async function assignProfileAsset() {
    if (!token || !selectedEmployeeId) return;
    setProfileAssetBusy(true);
    try {
      const payload = {
        name: profileAssetForm.name,
        serialNumber: profileAssetForm.serialNumber,
        assetType: profileAssetForm.assetType,
        model: profileAssetForm.model,
        description: profileAssetForm.description,
        status: 'assigned',
      };
      await apiRequest(`/api/employees/${selectedEmployeeId}/assets`, token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setProfileAssetForm({ showForm: false, name: '', serialNumber: '', assetType: '', model: '', description: '' });
      await loadEmployeeDetails(selectedEmployeeId);
      setMessage('Asset assigned successfully');
    } catch (err) {
      setMessage(err.error || 'Failed to assign asset');
    } finally {
      setProfileAssetBusy(false);
    }
  }

  async function updateShift() {
    if (!token || !selectedEmployeeId) return;
    try {
      const payload = {
        shiftName: employeeShift.shiftName,
        startTime: employeeShift.startTime,
        endTime: employeeShift.endTime,
        notes: employeeShift.notes,
      };
      await apiRequest(`/api/employees/${selectedEmployeeId}/shift`, token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await loadEmployeeDetails(selectedEmployeeId);
      setMessage('Shift roster updated');
    } catch (err) {
      setMessage(err.error || 'Failed to update shift roster');
    }
  }

  async function uploadPhoto(file) {
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    try {
      const result = await apiRequest('/api/employees/me/photo', token, { method: 'POST', body: form });
      await loadProfile();
      setMessage('Profile photo updated');
      return result.photoUrl;
    } catch (err) {
      setMessage(err.error || 'Photo upload failed');
    }
  }

  async function uploadCompanyLogo(file) {
    if (!file) return;
    if (!user || !isTeamRole(user.role)) {
      setMessage('Only managers can change the company logo.');
      return;
    }

    const form = new FormData();
    form.append('logo', file);
    try {
      await apiRequest('/api/company/logo', token, { method: 'POST', body: form });
      setCompanyLogoVersion(Date.now());
      setMessage('Company logo updated');
    } catch (err) {
      setMessage(err.error || 'Company logo update failed');
    }
  }

  async function loadLeaves() {
    if (!token) return;
    try {
      const list = await apiRequest('/api/leaves', token);
      setLeaveRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('loadLeaves error', err);
      setLeaveRequests([]);
    }
  }

  async function searchApplyLeaveEmployee(query) {
    if (!token || !query || query.length < 1) {
      setApplyLeaveResults([]);
      return;
    }
    setApplyLeaveSearchBusy(true);
    try {
      const results = await apiRequest(`/api/employees/search/query?q=${encodeURIComponent(query)}`, token);
      setApplyLeaveResults(Array.isArray(results) ? results : []);
    } catch (err) {
      setApplyLeaveResults([]);
    } finally {
      setApplyLeaveSearchBusy(false);
    }
  }

  async function applyLeaveOnBehalf() {
    if (!applyLeaveForm.employeeId || !applyLeaveForm.startDate || !applyLeaveForm.endDate || !applyLeaveForm.reason) {
      setMessage('Please fill in all fields: employee, leave dates, and reason.');
      return;
    }
    setApplyLeaveBusy(true);
    try {
      const payload = {
        employeeId: applyLeaveForm.employeeId,
        leaveType: applyLeaveForm.leaveType,
        startDate: applyLeaveForm.startDate,
        endDate: applyLeaveForm.endDate,
        reason: applyLeaveForm.reason,
        autoApprove: applyLeaveForm.autoApprove,
      };
      await apiRequest('/api/leaves/admin', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage(`✅ Leave (${applyLeaveForm.leaveType}) applied on behalf of ${applyLeaveSelectedEmp?.name || applyLeaveForm.employeeId} successfully!`);
      setApplyLeaveForm({ employeeId: '', leaveType: 'PH', startDate: '', endDate: '', reason: '', autoApprove: true });
      setApplyLeaveSelectedEmp(null);
      setApplyLeaveSearch('');
      setApplyLeaveResults([]);
      await loadLeaves();
      if (user && user.role === 'admin') await loadLeaveBalances();
    } catch (err) {
      setMessage(err.error || 'Failed to apply leave on behalf');
    } finally {
      setApplyLeaveBusy(false);
    }
  }

  async function loadLeaveBalances() {
    if (!token || !user || user.role !== 'admin') return;
    setLeaveBalanceBusy(true);
    try {
      const data = await apiRequest('/api/leaves/balances', token);
      setLeaveBalances(Array.isArray(data.employees) ? data.employees : []);
    } catch (err) {
      setLeaveBalances([]);
      setMessage(err.error || 'Failed to load leave balances');
    } finally {
      setLeaveBalanceBusy(false);
    }
  }

  async function loadHolidays() {
    if (!token || !user || user.role !== 'admin') return;
    try {
      const data = await apiRequest('/api/holidays', token);
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      setHolidays([]);
      setMessage(err.error || 'Failed to load holidays');
    }
  }

  async function applyLeave() {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) {
      setMessage('Please fill in leave dates and reason.');
      return;
    }
    try {
      await apiRequest('/api/leaves', token, {
        method: 'POST',
        body: JSON.stringify(leaveForm),
      });
      setLeaveForm({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
      setMessage('Leave request submitted.');
      await loadLeaves();
    } catch (err) {
      console.error('applyLeave error', err);
      setMessage(err.error || 'Failed to submit leave request');
    }
  }

  async function loadEmployeeMonthlyAttendance(employeeId, year, month) {
    if (!token || !employeeId) return;
    try {
      const data = await apiRequest(`/api/attendance/employee/${employeeId}/month/${year}/${month}`, token);
      setAttendanceEditorDays(Array.isArray(data.days) ? data.days : []);
      setAttendanceEditorYear(data.year || year);
      setAttendanceEditorMonth(data.month || month);
      setAttendanceSelectedDate(null);
      setAttendanceBulkStatus('');
    } catch (err) {
      console.error('loadEmployeeMonthlyAttendance error', err);
      setAttendanceEditorDays([]);
    }
  }

  async function loadShiftRoster(year, month) {
    if (!token) return setMessage('Authentication required');
    if (!employees || !employees.length) return setMessage('No employees loaded');
    const matrix = {};
    for (const emp of employees) {
      try {
        const data = await apiRequest(`/api/attendance/employee/${emp.employeeId}/month/${year}/${month}`, token);
        matrix[emp.employeeId] = Array.isArray(data.days) ? data.days.map(d => ({ day: d.day, date: d.date, shift: d.shift || '' })) : [];
      } catch (err) {
        matrix[emp.employeeId] = [];
      }
    }
    setRosterMatrix(matrix);
    setMessage('Roster loaded');
  }

  function updateRosterCell(employeeId, day, value) {
    setRosterMatrix(prev => {
      const arr = prev[employeeId] ? [...prev[employeeId]] : [];
      const idx = arr.findIndex(x => x.day === day);
      if (idx >= 0) arr[idx] = { ...arr[idx], shift: value };
      else arr.push({ day, shift: value });
      return { ...prev, [employeeId]: arr };
    });
  }

  async function saveRosterChanges() {
    if (!token) return setMessage('Authentication required');
    const y = attendanceEditorYear;
    const m = attendanceEditorMonth;
    for (const empId of Object.keys(rosterMatrix)) {
      const arr = rosterMatrix[empId] || [];
      const shifts = {};
      arr.forEach(item => { if (item.shift !== undefined) shifts[item.day] = item.shift; });
      try {
        await apiRequest(`/api/attendance/employee/${empId}/month/${y}/${m}/shifts`, token, { method: 'POST', body: JSON.stringify({ shifts }) });
      } catch (err) {
        console.error('Failed to save shifts for', empId, err);
        setMessage((prev) => prev + ` Failed to save ${empId}.`);
      }
    }
    setMessage('Roster saved');
    await loadShiftRoster(y, m);
  }

  function applyBulkToWeek(employeeId, year, month, status) {
    if (!status) return setMessage('Pick a status to apply');
    if (!attendanceSelectedDate) return setMessage('Select a date to mark its week');
    const sel = new Date(attendanceSelectedDate + 'T00:00:00');
    const selYear = sel.getFullYear();
    const selMonth = sel.getMonth();
    const weekStart = new Date(selYear, selMonth, sel.getDate() - sel.getDay());
    const weekEnd = new Date(selYear, selMonth, sel.getDate() - sel.getDay() + 6);
    setAttendanceEditorDays((prev) => {
      const map = new Map(prev.map(d => [d.date, { ...d }]));
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        map.set(dateStr, { date: dateStr, day: d.getDate(), status });
      }
      return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
    });
    setMessage('Week marked (' + status.toUpperCase() + ') — click Save to persist');
  }

  function applyBulkToMonth(employeeId, year, month, status) {
    if (!status) return setMessage('Pick a status to apply');
    const daysInMonth = new Date(year, month, 0).getDate();
    setAttendanceEditorDays((prev) => {
      const map = new Map(prev.map(d => [d.date, { ...d }]));
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        map.set(dateStr, { date: dateStr, day: d, status });
      }
      return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
    });
    setMessage('Month marked (' + status.toUpperCase() + ') — click Save to persist');
  }

  async function saveEmployeeMonthlyAttendance(employeeId, year, month, daysMap) {
    if (!token || !employeeId) return;
    try {
      await apiRequest(`/api/attendance/employee/${employeeId}/month/${year}/${month}`, token, { method: 'POST', body: JSON.stringify({ days: daysMap }) });
      setMessage('Attendance updated');
      await loadEmployeeMonthlyAttendance(employeeId, year, month);
    } catch (err) {
      console.error('saveEmployeeMonthlyAttendance error', err);
      setMessage(err.error || 'Failed to save attendance');
    }
  }

  async function decideLeave(leaveId, stage, approve) {
    if (!leaveId) return;
    const endpoint = stage === 'manager' ? `/api/leaves/${leaveId}/manager` : `/api/leaves/${leaveId}/company`;
    try {
      await apiRequest(endpoint, token, {
        method: 'PUT',
        body: JSON.stringify({ action: approve ? 'approve' : 'reject', note: leaveDecisionNotes[leaveId] || '' }),
      });
      setLeaveDecisionNotes((prev) => ({ ...prev, [leaveId]: '' }));
      setMessage(`Leave ${approve ? 'approved' : 'rejected'} successfully.`);
      await loadLeaves();
      if (user && user.role === 'admin') await loadLeaveBalances();
    } catch (err) {
      console.error('decideLeave error', err);
      setMessage(err.error || 'Failed to update leave request');
    }
  }

  function resetEmployeeForm() {
    setEditEmployeeId(null);
    setNewEmployee({ employeeId: '', name: '', email: '', designation: '', salary: '', password: '', role: 'employee' });
  }

  function prepareEmployeeEdit(emp) {
    setEditEmployeeId(emp.employeeId);
    setNewEmployee({
      employeeId: emp.employeeId,
      name: emp.name || '',
      email: emp.email || '',
      designation: emp.designation || '',
      salary: emp.salary || '',
      password: '',
      role: emp.role || 'employee',
    });
  }

  async function saveEmployee() {
    if (!newEmployee.employeeId || !newEmployee.name || (!editEmployeeId && !newEmployee.password)) {
      setMessage('Employee ID, name, and password are required for new employees.');
      return;
    }

    try {
      if (editEmployeeId) {
        const payload = {
          name: newEmployee.name,
          email: newEmployee.email,
          designation: newEmployee.designation,
          salary: newEmployee.salary,
          role: newEmployee.role,
        };
        if (newEmployee.password) {
          payload.password = newEmployee.password;
        }

        await apiRequest(`/api/employees/${editEmployeeId}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('Employee updated successfully');
        // if photo selected, upload it
        if (employeePhotoFile) {
          try {
            const form = new FormData();
            form.append('photo', employeePhotoFile);
            await apiRequest(`/api/employees/${editEmployeeId}/photo`, token, { method: 'POST', body: form });
            setEmployeePhotoFile(null);
          } catch (photoErr) {
            console.error('photo upload failed', photoErr);
            setMessage((prev)=> prev + ' (photo upload failed)');
          }
        }
      } else {
        await apiRequest('/api/employees', token, { method: 'POST', body: JSON.stringify(newEmployee) });
        setMessage('Employee created successfully');
      }

      resetEmployeeForm();
      await loadEmployees();
      if (selectedEmployeeId) await loadEmployeeDetails(selectedEmployeeId);
    } catch (err) {
      console.error('saveEmployee error:', err);
      setMessage(err.error || err.message || (typeof err === 'object' ? JSON.stringify(err) : err) || 'Employee save failed');
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replace(/"/g, '""')}"`;
  }

  async function downloadBulkTemplate() {
    if (!token) return setMessage('Authentication required. Please log in again.');
    setBulkDownloadBusy(true);
    try {
      const response = await fetch('/api/employees/bulk-template', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      downloadBlob(blob, 'employee_bulk_upload_template.xlsx');
      setMessage('Excel template downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkTemplate error:', err);
      setMessage((err && err.error) || (err && err.message) || 'Failed to download template');
    } finally {
      setBulkDownloadBusy(false);
    }
  }

  async function downloadBulkPdfTemplate() {
    if (!token) return setMessage('Authentication required. Please log in again.');
    setBulkDownloadBusy(true);
    try {
      const response = await fetch('/api/employees/bulk-template/pdf', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      downloadBlob(blob, 'employee_bulk_upload_template.pdf');
      setMessage('PDF template downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkPdfTemplate error:', err);
      setMessage((err && err.error) || (err && err.message) || 'Failed to download PDF template');
    } finally {
      setBulkDownloadBusy(false);
    }
  }

  async function downloadBulkPhTemplate() {
    if (!token) return setMessage('Authentication required. Please log in again.');
    setBulkPhBusy(true);
    try {
      const response = await fetch('/api/employees/bulk-ph-template', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Downloaded file is empty');
      downloadBlob(blob, 'employee_ph_bulk_template.xlsx');
      setMessage('PH template downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkPhTemplate error:', err);
      setMessage((err && err.error) || (err && err.message) || 'Failed to download PH template');
    } finally {
      setBulkPhBusy(false);
    }
  }

  async function downloadBulkPhotoTemplate() {
    if (!token) return setMessage('Authentication required. Please log in again.');
    setBulkPhotoBusy(true);
    try {
      const response = await fetch('/api/employees/bulk-photo-template', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Downloaded file is empty');
      downloadBlob(blob, 'employee_photo_upload_template.xlsx');
      setMessage('Photo upload template downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkPhotoTemplate error:', err);
      setMessage((err && err.error) || (err && err.message) || 'Failed to download photo upload template');
    } finally {
      setBulkPhotoBusy(false);
    }
  }

  async function uploadBulkPh() {
    if (!bulkPhFile) return setMessage('Choose the PH Excel or CSV file first.');
    if (!token) return setMessage('Authentication required. Please log in again.');
    const form = new FormData();
    form.append('file', bulkPhFile);
    setBulkPhBusy(true);
    try {
      const result = await apiRequest('/api/employees/bulk-ph-upload', token, { method: 'POST', body: form });
      setMessage(`PH upload complete: ${result.updatedCount || 0} updated, ${result.skippedCount || 0} skipped.`);
      await loadEmployees();
    } catch (err) {
      setMessage(err.error || err.message || 'PH upload failed');
    } finally {
      setBulkPhBusy(false);
    }
  }

  async function downloadBulkAnnualLeaveTemplate() {
    if (!token) return setMessage('Authentication required. Please log in again.');
    setBulkAnnualLeaveBusy(true);
    try {
      const response = await fetch('/api/employees/bulk-annual-leave-template', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Downloaded file is empty');
      downloadBlob(blob, 'employee_annual_leave_bulk_template.xlsx');
      setMessage('Annual leave template downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkAnnualLeaveTemplate error:', err);
      setMessage((err && err.error) || (err && err.message) || 'Failed to download annual leave template');
    } finally {
      setBulkAnnualLeaveBusy(false);
    }
  }

  async function uploadBulkAnnualLeave() {
    if (!bulkAnnualLeaveFile) return setMessage('Choose the Annual Leave Excel or CSV file first.');
    if (!token) return setMessage('Authentication required. Please log in again.');
    const form = new FormData();
    form.append('file', bulkAnnualLeaveFile);
    setBulkAnnualLeaveBusy(true);
    try {
      const result = await apiRequest('/api/employees/bulk-annual-leave-upload', token, { method: 'POST', body: form });
      setMessage(`Annual leave upload complete: ${result.updatedCount || 0} updated, ${result.skippedCount || 0} skipped.`);
      await loadEmployees();
    } catch (err) {
      setMessage(err.error || err.message || 'Annual leave upload failed');
    } finally {
      setBulkAnnualLeaveBusy(false);
    }
  }

  async function uploadBulkEmployees() {
    if (!bulkFile) return setMessage('Choose the completed PDF, Excel, or CSV file first.');
    if (!token) return setMessage('Authentication required. Please log in again.');

    const form = new FormData();
    form.append('file', bulkFile);
    setBulkBusy(true);
    setBulkResult(null);
    setBulkCredentials([]);
    setMessage('Creating employees from uploaded file...');

    try {
      const result = await apiRequest('/api/employees/bulk-upload', token, {
        method: 'POST',
        body: form,
      });
      setBulkResult(result);
      setBulkCredentials(Array.isArray(result.credentials) ? result.credentials : []);
      setMessage(`Bulk upload complete: ${result.createdCount || 0} created, ${result.skippedCount || 0} skipped.`);
      await loadEmployees();
    } catch (err) {
      setMessage(err.error || err.message || 'Bulk upload failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function uploadBulkPhotos() {
    if (!bulkPhotoFiles.length) return setMessage('Choose a photo folder first.');
    if (!token) return setMessage('Authentication required. Please log in again.');

    const form = new FormData();
    bulkPhotoFiles.forEach((file) => {
      const relativePath = file.webkitRelativePath || file.name;
      form.append('photos', file, relativePath);
      form.append('relativePaths', relativePath);
    });

    setBulkPhotoBusy(true);
    setBulkPhotoResult(null);
    setMessage('Matching employee photos...');

    try {
      const result = await apiRequest('/api/employees/bulk-photo-upload', token, {
        method: 'POST',
        body: form,
      });
      setBulkPhotoResult(result);
      setMessage(`Photo upload complete: ${result.matchedCount || 0} matched, ${result.skippedCount || 0} skipped.`);
      await loadEmployees();
      if (selectedEmployeeId) await loadEmployeeDetails(selectedEmployeeId);
    } catch (err) {
      setMessage(err.error || err.message || 'Bulk photo upload failed');
    } finally {
      setBulkPhotoBusy(false);
    }
  }

  function downloadBulkCredentials() {
    try {
      if (!bulkCredentials.length) return setMessage('No new credentials to download yet.');
      const headers = ['employeeId', 'username', 'password', 'name', 'email', 'designation', 'role'];
      const lines = [
        headers.map(csvCell).join(','),
        ...bulkCredentials.map((credential) => headers.map((key) => csvCell(credential[key])).join(',')),
      ];
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      if (!blob || blob.size === 0) {
        throw new Error('Generated CSV file is empty');
      }
      downloadBlob(blob, `employee_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
      setMessage('Credentials file downloaded successfully.');
    } catch (err) {
      console.error('downloadBulkCredentials error:', err);
      setMessage(err.message || 'Failed to download credentials');
    }
  }

  async function deleteEmployee(employeeId) {
    if (!employeeId) return;
    if (user && user.employeeId === employeeId) {
      setMessage('Cannot remove the account you are currently signed in with.');
      return;
    }
    if (!window.confirm(`Delete employee ${employeeId}? This cannot be undone.`)) return;

    try {
      await apiRequest(`/api/employees/${employeeId}`, token, { method: 'DELETE' });
      setMessage('Employee removed successfully');
      if (selectedEmployeeId === employeeId) {
        setSelectedEmployeeId('');
        setSelectedEmployeeDetails(null);
      }
      if (editEmployeeId === employeeId) {
        resetEmployeeForm();
      }
      await loadEmployees();
    } catch (err) {
      console.error('deleteEmployee error:', err);
      setMessage(err.error || err.message || (typeof err === 'object' ? JSON.stringify(err) : err) || 'Failed to remove employee');
    }
  }

  async function uploadEmployeeRowPhoto(employeeId, file) {
    if (!token || !employeeId || !file) return;
    const form = new FormData();
    form.append('photo', file);
    try {
      await apiRequest(`/api/employees/${employeeId}/photo`, token, { method: 'POST', body: form });
      setMessage('Photo uploaded');
      await loadEmployees();
      if (selectedEmployeeId === employeeId) await loadEmployeeDetails(employeeId);
    } catch (err) {
      console.error('uploadEmployeeRowPhoto error', err);
      setMessage(err.error || err.message || JSON.stringify(err) || 'Photo upload failed');
    }
  }

  function generateStrongPassword(length = 14) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
    return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
  }

  async function createSampleManager(roleType) {
    if (!token) {
      setMessage('Not authenticated');
      return;
    }
    const prefix = roleType === 'restaurant-manager' ? 'RM' : 'CM';
    const employeeId = `${prefix}${Date.now() % 100000}`;
    const password = generateStrongPassword();
    const payload = {
      employeeId,
      name: roleType === 'restaurant-manager' ? 'Sample Restaurant Manager' : 'Sample Company Manager',
      email: `${employeeId}@example.com`,
      password,
      role: roleType,
      designation: roleType === 'restaurant-manager' ? 'Restaurant Manager' : 'Company Manager',
      salary: 0,
    };
    try {
      await apiRequest('/api/employees', token, { method: 'POST', body: JSON.stringify(payload) });
      setMessage(`Sample account created: ${employeeId} / ${password}`);
      await loadEmployees();
    } catch (err) {
      console.error('createSampleManager error', err);
      setMessage(err.error || 'Failed to create sample account');
    }
  }

  async function loadCelebrations() {
    if (!token || !user) return;
    try {
      const data = await apiRequest('/api/employees/celebrations', token);
      setCelebrations(data);
    } catch (err) {
      // silently fail
    }
  }

  async function downloadPayslipPdf(payslipId) {
    if (!token || !payslipId) return;
    try {
      const response = await fetch(`/api/payroll/${payslipId}/pdf`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw err;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error('Downloaded file is empty');
      downloadBlob(blob, `payslip_${payslipId}.pdf`);
      addToast('✅ Payslip PDF downloaded successfully!', 'success');
    } catch (err) {
      addToast(err.error || err.message || 'Failed to download payslip', 'error');
    }
  }

  async function runPayroll() {
    const employeeId = payrollRequest.employeeId || (user && user.employeeId);
    if (!employeeId || !payrollRequest.month || !payrollRequest.year) {
      setMessage('Select an employee, month, and year before running payroll');
      return;
    }
    try {
      await apiRequest('/api/payroll/run', token, {
        method: 'POST',
        body: JSON.stringify({ ...payrollRequest, employeeId }),
      });
      setMessage('Payroll run successful');
      if (isPayrollManager(user.role)) {
        await loadPayrollForEmployee(employeeId);
      } else {
        await loadPayslips();
      }
    } catch (err) {
      setMessage(err.error || 'Payroll run failed');
    }
  }

  // ZKTeco Device Management Functions
  async function loadZktecoDevices() {
    try {
      const devices = await apiRequest('/api/zkteco', token);
      setZktecoDevices(Array.isArray(devices) ? devices : []);
    } catch (err) {
      console.error('Failed to load ZKTeco devices', err);
      setZktecoDevices([]);
    }
  }

  async function loadZktecoSyncLogs() {
    try {
      const logs = await apiRequest('/api/zkteco/logs?limit=50', token);
      setZktecoSyncLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error('Failed to load sync logs', err);
    }
  }

  function updateZktecoForm(field, value) {
    setZktecoForm(prev => ({ ...prev, [field]: value }));
  }

  function updateZktecoEditForm(field, value) {
    setZktecoEditForm(prev => ({ ...prev, [field]: value }));
  }

  async function saveZktecoDevice() {
    if (!zktecoForm.name || !zktecoForm.ipAddress) {
      setMessage('Device name and IP address are required');
      return;
    }
    try {
      const payload = {
        name: zktecoForm.name,
        ipAddress: zktecoForm.ipAddress,
        port: parseInt(zktecoForm.port, 10) || 4370,
        location: zktecoForm.location || '',
        outletName: zktecoForm.outletName || '',
        serialNumber: zktecoForm.serialNumber || '',
        autoSync: zktecoForm.autoSync,
        syncInterval: parseInt(zktecoForm.syncInterval, 10) || 5,
      };
      const device = await apiRequest('/api/zkteco', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('Device registered successfully');
      setZktecoForm({ name: '', ipAddress: '', port: 4370, location: '', outletName: '', serialNumber: '', autoSync: true, syncInterval: 5 });
      await loadZktecoDevices();
      setZktecoPage('list');
    } catch (err) {
      setMessage(err.error || err.message || 'Failed to save device');
    }
  }

  async function updateZktecoDevice() {
    if (!zktecoSelectedDevice || !zktecoSelectedDevice.id) return;
    try {
      await apiRequest('/api/zkteco/' + zktecoSelectedDevice.id, token, {
        method: 'PUT',
        body: JSON.stringify(zktecoEditForm),
      });
      setMessage('Device updated successfully');
      await loadZktecoDevices();
      setZktecoPage('list');
    } catch (err) {
      setMessage(err.error || 'Failed to update device');
    }
  }

  async function deleteZktecoDevice(deviceId) {
    if (!window.confirm('Delete this ZKTeco device? This will also delete all associated sync logs.')) return;
    try {
      await apiRequest('/api/zkteco/' + deviceId, token, { method: 'DELETE' });
      setMessage('Device deleted');
      await loadZktecoDevices();
    } catch (err) {
      setMessage(err.error || 'Failed to delete device');
    }
  }

  async function syncSingleDevice(deviceId) {
    setZktecoSyncing(true);
    try {
      const result = await apiRequest('/api/zkteco/' + deviceId + '/sync', token, { method: 'POST' });
      setMessage('Sync completed: ' + (result.syncedAttendance || 0) + ' attendance records synced');
      await loadZktecoDevices();
    } catch (err) {
      setMessage(err.error || 'Sync failed');
    } finally {
      setZktecoSyncing(false);
    }
  }

  async function syncAllDevices() {
    setZktecoSyncing(true);
    try {
      const result = await apiRequest('/api/zkteco/sync-all', token, { method: 'POST' });
      const results = result.results || [];
      const total = results.reduce(function(sum, r) { return sum + (r.syncedAttendance || 0); }, 0);
      setMessage('All devices synced: ' + total + ' total attendance records');
      await loadZktecoDevices();
    } catch (err) {
      setMessage(err.error || 'Sync all failed');
    } finally {
      setZktecoSyncing(false);
    }
  }

  async function testDeviceConnection(deviceId) {
    try {
      const device = await apiRequest('/api/zkteco/' + deviceId, token);
      if (device.ipAddress) {
        const result = await apiRequest('/api/zkteco/test-connection', token, {
          method: 'POST',
          body: JSON.stringify({ ipAddress: device.ipAddress, port: device.port || 4370 }),
        });
        setMessage(result.success ? 'Connection successful: ' + (result.deviceName || result.message) : 'Connection failed: ' + result.message);
      }
    } catch (err) {
      setMessage(err.error || 'Test connection failed');
    }
  }

  async function testConnection(ipAddress, port) {
    if (!ipAddress) return setMessage('Enter an IP address first');
    try {
      const result = await apiRequest('/api/zkteco/test-connection', token, {
        method: 'POST',
        body: JSON.stringify({ ipAddress, port: port || 4370 }),
      });
      setMessage(result.success ? '✅ Connected: ' + (result.deviceName || result.serialNumber || 'Device found') : '❌ ' + result.message);
    } catch (err) {
      setMessage(err.error || 'Connection test failed');
    }
  }

  async function saveZktecoMapping() {
    if (!zktecoSelectedDevice || !zktecoSelectedDevice.id) return;
    try {
      let userMapping = {};
      try {
        userMapping = JSON.parse(zktecoMappingText);
      } catch (e) {
        setMessage('Invalid JSON format. Please check your mapping syntax.');
        return;
      }
      await apiRequest('/api/zkteco/' + zktecoSelectedDevice.id + '/mapping', token, {
        method: 'PUT',
        body: JSON.stringify({ userMapping }),
      });
      setMessage('Employee mapping saved successfully');
      await loadZktecoDevices();
      setZktecoPage('list');
    } catch (err) {
      setMessage(err.error || 'Failed to save mapping');
    }
  }

  async function saveZktecoGeofence() {
    if (!zktecoSelectedDevice || !zktecoSelectedDevice.id) return;
    try {
      await apiRequest('/api/zkteco/' + zktecoSelectedDevice.id, token, {
        method: 'PUT',
        body: JSON.stringify({
          geofenceEnabled: zktecoGeofenceForm.enabled,
          geofenceLatitude: zktecoGeofenceForm.latitude || null,
          geofenceLongitude: zktecoGeofenceForm.longitude || null,
          geofenceRadius: parseInt(zktecoGeofenceForm.radius, 10) || 100,
        }),
      });
      setMessage('Geofence settings saved');
      await loadZktecoDevices();
      setZktecoPage('list');
    } catch (err) {
      setMessage(err.error || 'Failed to save geofence');
    }
  }

  // ==================== REQUEST HUB FUNCTIONS ====================
  async function loadReqData(tabName) {
    if (!token) return;
    setReqBusy(true);
    try {
      if (tabName === 'tickets') {
        const data = await apiRequest('/api/requests/tickets', token);
        setTickets(Array.isArray(data) ? data : []);
      } else if (tabName === 'expenses') {
        const data = await apiRequest('/api/requests/expenses', token);
        setExpenses(Array.isArray(data) ? data : []);
      } else if (tabName === 'loans') {
        const data = await apiRequest('/api/requests/loans', token);
        setLoans(Array.isArray(data) ? data : []);
      } else if (tabName === 'medical') {
        const data = await apiRequest('/api/requests/medical-reimbursements', token);
        setMedicalReimbursements(Array.isArray(data) ? data : []);
      } else if (tabName === 'air-tickets') {
        const data = await apiRequest('/api/requests/air-tickets', token);
        setAirTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('loadReqData error', err);
    } finally {
      setReqBusy(false);
    }
  }

  async function submitTicket() {
    if (!token || !ticketForm.subject || !ticketForm.description) return;
    setReqBusy(true);
    try {
      await apiRequest('/api/requests/tickets', token, {
        method: 'POST',
        body: JSON.stringify({
          subject: ticketForm.subject,
          category: ticketForm.category,
          description: ticketForm.description,
          priority: ticketForm.priority,
        }),
      });
      setTicketForm({ subject: '', category: 'attendance', description: '', priority: 'medium' });
      setMessage('Ticket submitted successfully');
      await loadReqData('tickets');
    } catch (err) {
      setMessage(err.error || 'Failed to submit ticket');
    } finally {
      setReqBusy(false);
    }
  }

  async function submitExpense() {
    if (!token || !expenseForm.amount || !expenseForm.description || !expenseForm.expenseDate) return;
    setReqBusy(true);
    try {
      const form = new FormData();
      form.append('amount', expenseForm.amount);
      form.append('category', expenseForm.category);
      form.append('description', expenseForm.description);
      form.append('expenseDate', expenseForm.expenseDate);
      if (expenseFile) form.append('invoice', expenseFile);
      await apiRequest('/api/requests/expenses', token, { method: 'POST', body: form });
      setExpenseForm({ amount: '', category: 'other', description: '', expenseDate: '' });
      setExpenseFile(null);
      setMessage('Expense submitted successfully');
      await loadReqData('expenses');
    } catch (err) {
      setMessage(err.error || 'Failed to submit expense');
    } finally {
      setReqBusy(false);
    }
  }

  async function submitLoan() {
    if (!token || !loanForm.amount || !loanForm.purpose) return;
    setReqBusy(true);
    try {
      await apiRequest('/api/requests/loans', token, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(loanForm.amount),
          purpose: loanForm.purpose,
          totalInstallments: parseInt(loanForm.totalInstallments, 10),
        }),
      });
      setLoanForm({ amount: '', purpose: '', totalInstallments: 3 });
      setMessage('Loan application submitted successfully');
      await loadReqData('loans');
    } catch (err) {
      setMessage(err.error || 'Failed to submit loan application');
    } finally {
      setReqBusy(false);
    }
  }

  async function payInstallment(loanId) {
    if (!token || !loanId) return;
    setReqBusy(true);
    try {
      await apiRequest('/api/requests/loans/' + loanId + '/pay-installment', token, { method: 'POST' });
      setMessage('Installment paid successfully');
      await loadReqData('loans');
    } catch (err) {
      setMessage(err.error || 'Failed to pay installment');
    } finally {
      setReqBusy(false);
    }
  }

  async function submitMedicalReimbursement() {
    if (!token || !medicalForm.amount || !medicalForm.description || !medicalForm.hospitalName || !medicalForm.expenseDate) return;
    setReqBusy(true);
    try {
      const form = new FormData();
      form.append('amount', medicalForm.amount);
      form.append('medicalType', medicalForm.medicalType);
      form.append('description', medicalForm.description);
      form.append('hospitalName', medicalForm.hospitalName);
      form.append('expenseDate', medicalForm.expenseDate);
      if (medicalFile) form.append('receipt', medicalFile);
      await apiRequest('/api/requests/medical-reimbursements', token, { method: 'POST', body: form });
      setMedicalForm({ amount: '', medicalType: 'consultation', description: '', hospitalName: '', expenseDate: '' });
      setMedicalFile(null);
      setMessage('Medical reimbursement request submitted successfully');
      await loadReqData('medical');
    } catch (err) {
      setMessage(err.error || 'Failed to submit medical reimbursement request');
    } finally {
      setReqBusy(false);
    }
  }

  async function submitAirTicket() {
    if (!token || !airTicketForm.amount || !airTicketForm.purpose || !airTicketForm.departureCity || !airTicketForm.destinationCity || !airTicketForm.airline || !airTicketForm.ticketNumber || !airTicketForm.departureDate) return;
    setReqBusy(true);
    try {
      const form = new FormData();
      form.append('amount', airTicketForm.amount);
      form.append('ticketType', airTicketForm.ticketType);
      form.append('purpose', airTicketForm.purpose);
      form.append('departureCity', airTicketForm.departureCity);
      form.append('destinationCity', airTicketForm.destinationCity);
      form.append('airline', airTicketForm.airline);
      form.append('ticketNumber', airTicketForm.ticketNumber);
      form.append('departureDate', airTicketForm.departureDate);
      if (airTicketForm.returnDate) form.append('returnDate', airTicketForm.returnDate);
      if (airTicketFile) form.append('invoice', airTicketFile);
      await apiRequest('/api/requests/air-tickets', token, { method: 'POST', body: form });
      setAirTicketForm({ amount: '', ticketType: 'domestic', purpose: '', departureCity: '', destinationCity: '', airline: '', ticketNumber: '', departureDate: '', returnDate: '' });
      setAirTicketFile(null);
      setMessage('Air ticket reimbursement request submitted successfully');
      await loadReqData('air-tickets');
    } catch (err) {
      setMessage(err.error || 'Failed to submit air ticket reimbursement request');
    } finally {
      setReqBusy(false);
    }
  }

  // Load ZKTeco devices when admin page changes to zkteco
  useEffect(function() {
    if (token && user && user.role === 'admin' && adminPage === 'zkteco') {
      loadZktecoDevices();
    }
  }, [token, user, adminPage]);

  // Pre-fill forms when selecting a device
  useEffect(function() {
    if (zktecoSelectedDevice) {
      setZktecoEditForm({
        name: zktecoSelectedDevice.name || '',
        ipAddress: zktecoSelectedDevice.ipAddress || '',
        port: zktecoSelectedDevice.port || 4370,
        location: zktecoSelectedDevice.location || '',
        outletName: zktecoSelectedDevice.outletName || '',
        serialNumber: zktecoSelectedDevice.serialNumber || '',
        isActive: zktecoSelectedDevice.isActive !== false,
      });
      setZktecoMappingText(JSON.stringify(zktecoSelectedDevice.userMapping || {}, null, 2));
      setZktecoGeofenceForm({
        enabled: zktecoSelectedDevice.geofenceEnabled || false,
        latitude: zktecoSelectedDevice.geofenceLatitude || '',
        longitude: zktecoSelectedDevice.geofenceLongitude || '',
        radius: zktecoSelectedDevice.geofenceRadius || 100,
      });
    }
  }, [zktecoSelectedDevice]);

  function logout() {
    setToken(null);
    setUser(null);
    setMessage('Signed out');
  }

  // Dashboard loading animation screen
  if (loadingDashboard) {
    return h('div', { className: 'dashboard-loading-shell' }, [
      h('div', { className: 'dashboard-loading-content' }, [
        h('div', { className: 'dashboard-loading-logo' }, [
          h('img', { src: '/images/Reyadah_Logo.png', alt: 'Logo', style: { width: '80px', height: '80px', objectFit: 'contain' } }),
        ]),
        h('h2', { className: 'dashboard-loading-title' }, 'Welcome to Reyadah HR'),
        h('div', { className: 'dashboard-loading-bar' }, [
          h('div', { className: 'dashboard-loading-fill' }),
        ]),
        h('p', { className: 'dashboard-loading-text' }, 'Loading your dashboard...'),
      ]),
    ]);
  }

  if (!token || !user) {
    return h('div', { className: 'login-shell' }, [
      h('div', { className: 'login-grid' }, [
        h('section', { className: 'login-side' }, [
          h('span', { className: 'company-badge' }, '🏢 REYADAH - HR PORTAL'),
          h('div', { className: 'hero-logo' }, [
            h('img', { src: '/images/Reyadah_Logo.png', alt: 'Logo', style: { width: '100%', height: '100%', objectFit: 'contain' } }),
          ]),
          h('h1', null, 'Welcome to Reyadah 🚀'),
          h('p', { className: 'hero-copy' }, 'Your complete HR & attendance management portal. Sign in to access payroll, documents, leave management, and more.'),
          h('div', { className: 'feature-list' }, [
            h('div', { className: 'feature-item' }, [
              h('span', { className: 'feature-badge' }, '📸'),
              h('p', null, 'Face recognition attendance tracking'),
            ]),
            h('div', { className: 'feature-item' }, [
              h('span', { className: 'feature-badge' }, '💰'),
              h('p', null, 'Payslip & payroll management'),
            ]),
            h('div', { className: 'feature-item' }, [
              h('span', { className: 'feature-badge' }, '📄'),
              h('p', null, 'Document upload and secure storage'),
            ]),
            h('div', { className: 'feature-item' }, [
              h('span', { className: 'feature-badge' }, '✈️'),
              h('p', null, 'Leave & air ticket requests'),
            ]),
          ]),
          h('div', { className: 'promo-card' }, [
            h('h3', null, '🌟 New! AI Assistant'),
            h('p', null, 'Get instant answers about your attendance, leave, and payslips with our AI chatbot.'),
            h('span', { className: 'badge', style: { background: '#fff', color: 'var(--accent)', marginTop: '8px' } }, 'Try saying "Help"'),
          ]),
        ]),

        h('section', { className: 'login-panel card auth-card' }, [
          h('div', { className: 'auth-heading' }, [
            h('p', { className: 'eyebrow' }, 'Employee login'),
            h('h2', null, 'Access your Reyadah portal'),
          ]),
          h('p', { className: 'muted auth-intro' }, 'Use your Employee No and password to continue.'),
          h('label', { className: 'field' }, [
            'Login ID',
            h('input', {
              value: loginState.employeeId,
              onChange: (e) => setLoginState((prev) => ({ ...prev, employeeId: e.target.value })),
              onKeyDown: handleLoginKeyDown,
              placeholder: 'Employee No',
              autoFocus: true,
              disabled: loginBusy,
            }),
          ]),
          h('label', { className: 'field password-field' }, [
            'Password',
            h('div', { className: 'password-input-wrapper' }, [
              h('input', {
                type: showPassword ? 'text' : 'password',
                value: loginState.password,
                onChange: (e) => setLoginState((prev) => ({ ...prev, password: e.target.value })),
                onKeyDown: handleLoginKeyDown,
                placeholder: 'Password',
                disabled: loginBusy,
              }),
              h('button', {
                className: 'password-toggle-btn',
                onClick: () => setShowPassword(prev => !prev),
                type: 'button',
                tabIndex: -1,
                title: showPassword ? 'Hide password' : 'Show password',
              }, showPassword ? '🙈' : '👁️'),
            ]),
          ]),
          h('div', { className: 'auth-row' }, [
            h('a', { className: 'link muted', href: '#', onClick: (e) => { e.preventDefault(); setMessage('Please contact your HR administrator to reset your password.'); } }, 'Forgot password?'),
            h('button', { className: 'btn primary', onClick: signIn, disabled: loginBusy }, 
              loginBusy ? h('span', { className: 'login-spinner' }, [
                h('span', { className: 'spinner-dot' }),
                h('span', { className: 'spinner-dot' }),
                h('span', { className: 'spinner-dot' }),
              ]) : 'Login'
            ),
          ]),
          h('div', { className: 'divider' }, [
            h('span', null, 'or sign in with'),
          ]),
          h('div', { className: 'social-row' }, [
            h('button', { className: 'social-icon google', onClick: () => setMessage('Google login coming soon!'), title: 'Sign in with Google' }, 
              h('span', { style: { fontSize: '20px' } }, 'G')
            ),
            h('button', { className: 'social-icon microsoft', onClick: () => setMessage('Microsoft login coming soon!'), title: 'Sign in with Microsoft' }, 
              h('span', { style: { fontSize: '20px', fontWeight: 700 } }, 'M')
            ),
            h('button', { className: 'social-icon apple', onClick: () => setMessage('Apple login coming soon!'), title: 'Sign in with Apple' }, 
              h('span', { style: { fontSize: '22px' } }, '')
            ),
          ]),
          h('div', { className: 'auth-footer' }, [
            h('p', { className: 'muted' }, [
              'Need help? ',
              h('a', { href: '#', onClick: (e) => { e.preventDefault(); setMessage('Contact your HR administrator for assistance.'); } }, 'Contact support'),
            ]),
            h('div', { className: 'legal-links' }, [
              h('a', { href: '/privacy' }, 'Privacy Policy'),
              h('a', { href: '/terms' }, 'Terms of Service'),
            ]),
          ]),
          message && h('div', { className: 'message-card' }, message),
        ]),
      ]),
    ]);
  }

  const pendingLeaveRequests = leaveRequests.filter((leave) => leave.status !== 'approved' && leave.status !== 'rejected');
  const approvedLeaveRequests = leaveRequests.filter((leave) => leave.status === 'approved');
  const totalTeamDocuments = employees.reduce((total, employee) => total + ((employee.documents || []).length), 0);
  const employeesWithShift = employees.filter(hasAssignedShift).length;
  const employeesWithoutShift = Math.max(0, employees.length - employeesWithShift);
  const roleCounts = employees.reduce((counts, employee) => {
    const role = employee.role || 'employee';
    return { ...counts, [role]: (counts[role] || 0) + 1 };
  }, {});
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendanceRecords.find((record) => record.date === todayKey);
  const isClockedIn = Boolean(todayAttendance && todayAttendance.clockIn && !todayAttendance.clockOut);
  const directoryQuery = employeeSearch.trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) => {
    const matchesRole = roleFilter === 'all' || employee.role === roleFilter;
    const searchable = [
      employee.employeeId,
      employee.name,
      employee.email,
      employee.designation,
      employee.role,
    ].filter(Boolean).join(' ').toLowerCase();
    return matchesRole && (!directoryQuery || searchable.includes(directoryQuery));
  });
  const filteredLeaveBalances = leaveBalances.filter((employee) => {
    const searchable = [
      employee.employeeId,
      employee.name,
      employee.designation,
      employee.role,
    ].filter(Boolean).join(' ').toLowerCase();
    return !directoryQuery || searchable.includes(directoryQuery);
  });
  const leaveBalanceTotals = leaveBalances.reduce((totals, employee) => ({
    annualBalance: totals.annualBalance + Number(employee.annual?.balance || 0),
    phBalance: totals.phBalance + Number(employee.ph?.balance || 0),
    annualPending: totals.annualPending + Number(employee.annual?.pending || 0),
    phPending: totals.phPending + Number(employee.ph?.pending || 0),
  }), { annualBalance: 0, phBalance: 0, annualPending: 0, phPending: 0 });
  const adminPageLabels = {
    team: 'Team directory',
    bulkUpload: 'Bulk upload',
    leaveBalances: 'Leave balances',
    employeeLeave: 'Employee Leave',
    applyLeave: 'Apply Leave',
    faceRegister: 'Face Registration',
    assignAsset: 'Assign asset',
    assignShift: 'Shift roster',
    zkteco: 'ZKTeco devices',
    tickets: 'Tickets 🎫',
    biometric: 'Biometric API',
    reports: 'Reports',
    holidays: 'Holidays',
    departments: 'Departments',
    auditLog: 'Audit Log',
    eos: 'End of Service',
  };
  const payrollDisplayRecords = isPayrollManager(user.role) ? teamPayslips : payslips;
  const selectedPayrollEmployee = employees.find((employee) => employee.employeeId === payrollRequest.employeeId);
  const attendanceInfoSummary = attendanceInfoReport?.summary || {};
  const attendanceInfoQuery = attendanceInfoSearch.trim().toLowerCase();
  const attendanceInfoEmployees = (attendanceInfoReport?.employees || []).map((employee) => {
    const matchesSearch = !attendanceInfoQuery || [
      employee.employeeId,
      employee.name,
      employee.email,
      employee.designation,
      employee.role,
    ].filter(Boolean).join(' ').toLowerCase().includes(attendanceInfoQuery);
    const visibleDays = (employee.days || []).filter((day) => {
      if (attendanceInfoStatusFilter === 'all') return true;
      if (attendanceInfoStatusFilter === 'not-marked') return !day.status;
      if (attendanceInfoStatusFilter === 'full-day') return day.workType === 'Full day';
      if (attendanceInfoStatusFilter === 'half-day') return day.workType === 'Half day';
      return day.status === attendanceInfoStatusFilter;
    });
    return { ...employee, matchesSearch, visibleDays };
  }).filter((employee) => employee.matchesSearch && (attendanceInfoStatusFilter === 'all' || employee.visibleDays.length > 0));
  const taskItems = [
    {
      title: isClockedIn ? 'Clock out for today' : 'Clock in for today',
      detail: todayAttendance ? `Today: ${todayAttendance.status || 'present'}` : 'No attendance record for today yet',
      actionLabel: isClockedIn ? 'Clock Out' : 'Clock In',
      onAction: () => clockAction(isClockedIn ? '/api/attendance/clock-out' : '/api/attendance/clock-in'),
    },
    {
      title: docs.length ? 'Review your document center' : 'Upload your first document',
      detail: `${docs.length} document${docs.length === 1 ? '' : 's'} saved`,
      actionLabel: 'Open Documents',
      onAction: () => setTab('documents'),
    },
    {
      title: pendingLeaveRequests.length ? 'Leave request needs attention' : 'Leave requests are clear',
      detail: `${pendingLeaveRequests.length} pending, ${approvedLeaveRequests.length} approved`,
      actionLabel: canView('leave-approvals') && pendingLeaveRequests.length ? 'Review Leaves' : 'Open Leave',
      onAction: () => setTab(canView('leave-approvals') && pendingLeaveRequests.length ? 'leave-approvals' : 'leave'),
    },
  ];
  if (isTeamRole(user.role)) {
    taskItems.push({
      title: employeesWithoutShift ? 'Assign missing shifts' : 'Shift roster is assigned',
      detail: `${employeesWithoutShift} employee${employeesWithoutShift === 1 ? '' : 's'} without shifts`,
      actionLabel: 'Open Roster',
      onAction: () => setTab(canView('shift-roster') ? 'shift-roster' : 'admin'),
    });
  }

  return h('div', { className: 'shell' }, [
    h('aside', { className: 'sidebar' }, [
      h('div', { className: 'brand-panel' }, [
        h('img', { src: companyLogoSrc, className: 'sidebar-logo-img', alt: 'Reyadah Logo', onError: (e) => { e.target.style.display = 'none'; } }),
        h('div', null, [
          h('p', { className: 'brand-title' }, 'Reyadah'),
          h('p', { className: 'brand-subtitle' }, 'HR & Attendance'),
        ]),
      ]),
      h('nav', { className: 'nav-panel' }, [
        canView('home') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.home ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, home: !prev.home })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.home ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '🏠'),
            h('span', null, 'Home'),
          ]),
          expandedSections.home && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Home', icon: 'HM', active: tab === 'home', onClick: () => setTab('home') }),
            h(NavButton, { label: 'Profile', icon: 'PR', active: tab === 'profile', onClick: () => setTab('profile') }),
          ]),
        ]),

        canView('tasks') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.tasks ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, tasks: !prev.tasks })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.tasks ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '📋'),
            h('span', null, 'To do'),
          ]),
          expandedSections.tasks && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Tasks', icon: 'TD', active: tab === 'tasks', onClick: () => setTab('tasks') }),
          ]),
        ]),

        canView('payroll') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.payroll ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, payroll: !prev.payroll })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.payroll ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '💰'),
            h('span', null, 'Salary'),
          ]),
          expandedSections.payroll && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Payroll', icon: 'PR', active: tab === 'payroll', onClick: () => setTab('payroll') }),
            canView('payslips') && h(NavButton, { label: 'Payslips', icon: 'PS', active: tab === 'payslips', onClick: () => setTab('payslips') }),
          ]),
        ]),

        canView('leave') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.leave ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, leave: !prev.leave })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.leave ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '📅'),
            h('span', null, 'Leave'),
          ]),
          expandedSections.leave && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Apply', icon: 'LV', active: tab === 'leave', onClick: () => setTab('leave') }),
            canView('leave-approvals') && h(NavButton, { label: 'Approvals', icon: 'AP', count: pendingLeaveRequests.length, active: tab === 'leave-approvals', onClick: () => setTab('leave-approvals') }),
          ]),
        ]),

        canView('attendance') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.attendance ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, attendance: !prev.attendance })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.attendance ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '✔️'),
            h('span', null, 'Attendance'),
          ]),
          expandedSections.attendance && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Attendance', icon: 'AT', active: tab === 'attendance', onClick: () => setTab('attendance') }),
            canView('attendance-info') && h(NavButton, { label: 'Attendance Info', icon: 'AI', active: tab === 'attendance-info', onClick: () => setTab('attendance-info') }),
            canView('attendance-editor') && h(NavButton, { label: 'Manual Editor', icon: 'ME', active: tab === 'attendance-editor', onClick: () => setTab('attendance-editor') }),
            canView('shift-roster') && h(NavButton, { label: 'Shift Roster', icon: 'SR', active: tab === 'shift-roster', onClick: () => setTab('shift-roster') }),
          ]),
        ]),

        false && canView('hiring') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.hiring ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, hiring: !prev.hiring })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.hiring ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '👥'),
            h('span', null, 'Hiring'),
            h('span', { className: 'badge-new' }, 'New'),
          ]),
          expandedSections.hiring && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Candidates', icon: 'HR', active: tab === 'hiring', onClick: () => setTab('hiring') }),
          ]),
        ]),

        canView('employees-section') && h('div', { className: 'nav-section' }, [
          h('div', { className: `section-title ${expandedSections.employees ? '' : 'collapsed'}`, onClick: () => setExpandedSections(prev => ({ ...prev, employees: !prev.employees })) }, [
            h('span', { className: 'section-toggle' }, expandedSections.employees ? '▼' : '▶'),
            h('span', { className: 'section-icon' }, '👥'),
            h('span', null, 'Employees'),
          ]),
          expandedSections.employees && h('div', { className: 'section-items' }, [
            h(NavButton, { label: 'Directory', icon: 'ED', active: tab === 'employees', onClick: () => setTab('employees') }),
            h(NavButton, { label: 'Org Chart', icon: 'OC', active: tab === 'org-chart', onClick: () => setTab('org-chart') }),
            h(NavButton, { label: 'Leave Balances', icon: 'LB', active: tab === 'emp-leave-balances', onClick: () => setTab('emp-leave-balances') }),
          ]),
        ]),
        canView('documents') && h(NavButton, { label: 'Document Center', icon: 'DC', count: docs.length, active: tab === 'documents', onClick: () => setTab('documents') }),
        canView('requests') && h(NavButton, { label: 'Request Hub', icon: 'RQ', active: tab === 'requests', onClick: () => setTab('requests') }),
        canView('company') && h(NavButton, { label: 'Company', icon: 'CP', count: employees.length, active: tab === 'company', onClick: () => setTab('company') }),
        canView('admin') && h(NavButton, { label: 'Admin', icon: 'AD', count: employees.length, active: tab === 'admin', onClick: () => setTab('admin') }),
        h(NavButton, { label: 'Help', icon: '❓', active: tab === 'help', onClick: () => setTab('help') }),
      ]),
      h('div', { className: 'status-card' }, [
        h('p', { className: 'status-label' }, 'Signed in as'),
        h('p', { className: 'status-value' }, user.name || user.employeeId),
        h('p', { className: 'status-label' }, 'Role'),
        h('p', { className: 'status-value' }, user.role),
        h('button', { className: 'btn secondary', style: { marginTop: '14px', width: '100%' }, onClick: logout }, 'Sign out'),
      ]),
    ]),

    h('main', { className: 'workspace' }, [
      h(ToastContainer, { toasts, removeToast }),
      h('header', { className: 'topbar' }, [
        h('div', null, [
          h('p', { className: 'eyebrow' }, 'Reyadah Home'),
          h('h1', null, 'Hello, ' + (user.name || user.employeeId)),
        ]),
        h('div', { className: 'top-actions', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [
          h('button', {
            className: `theme-switch ${darkTheme ? 'active' : ''}`,
            onClick: () => setDarkTheme(prev => !prev),
            title: 'Toggle dark/light theme',
          }, [
            h('span', null, darkTheme ? '☀️' : '🌙'),
            h('div', { className: 'toggle-track' }, [
              h('div', { className: 'toggle-thumb' }),
            ]),
          ]),
          h('span', { className: 'badge' }, user.role === 'admin' ? 'Admin Portal' : 'Employee Portal'),
        ]),
      ]),
      h('div', { className: 'grid main-grid' }, [
        tab === 'home' && h('div', { className: 'grid' }, [
          h('div', { className: `card home-hero ${homeActive ? 'animated' : ''}` }, [
            h('div', { className: 'hero-header' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Welcome back'),
                h('h2', null, `Hi ${user.name || user.employeeId}, here's your work summary`),
              ]),
              h('div', { className: `hero-meta ${homeActive ? 'animated' : ''}` }, [
                h('span', { className: `badge ${homeActive ? 'animated' : ''}` }, `Role: ${user.role}`),
              ]),
              h('div', { className: 'home-avatar-shell' }, [
                user.photoUrl
                  ? h('img', { src: user.photoUrl, className: 'home-avatar', alt: user.name || 'Profile' })
                  : h('div', { className: 'home-avatar placeholder' }, user.name ? user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : '?'),
              ]),
            ]),
            h('p', { className: `muted hero-copy ${homeActive ? 'animated' : ''}` }, 'Quick access to attendance, payroll, documents, and employee services.'),
            h('div', { className: 'stats-grid home-stats' }, [
              h(StatTile, { label: 'Attendance days', value: attendanceRecords.length || 0, variant: 'red', active: homeActive }),
              h(StatTile, { label: 'Leave balance', value: user.leaveBalance || 10, variant: 'white', active: homeActive }),
              h(StatTile, { label: 'Payslips', value: payslips.length || 0, variant: 'light', active: homeActive }),
            ]),
            h('div', { className: 'home-actions' }, [
              h('button', { className: 'btn red', onClick: () => clockAction('/api/attendance/clock-in') }, 'Clock In'),
              h('button', { className: 'btn white', onClick: () => clockAction('/api/attendance/clock-out') }, 'Clock Out'),
              h('button', { className: 'btn secondary', onClick: () => setTab('documents') }, 'Upload Document'),
              h('button', { className: 'btn secondary', onClick: () => setTab('payroll') }, 'View Payslips'),
            ]),
          ]),
          user.role === 'admin' && h('div', { className: 'executive-dashboard' }, [
            h('div', { className: 'card dashboard-panel wide' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Admin overview'),
                  h('h2', null, 'Workforce command center'),
                ]),
                h('button', { className: 'btn secondary small', onClick: () => setTab('admin') }, 'Open admin tools'),
              ]),
              h('div', { className: 'stats-grid executive-stats' }, [
                h(StatTile, { label: 'Employees', value: employees.length, variant: 'white', hint: `${roleCounts.employee || 0} staff` }),
                h(StatTile, { label: 'Pending leaves', value: pendingLeaveRequests.length, variant: 'light', hint: `${approvedLeaveRequests.length} approved` }),
                h(StatTile, { label: 'Unassigned shifts', value: employeesWithoutShift, variant: employeesWithoutShift ? 'red' : 'white', hint: `${employeesWithShift} assigned` }),
                h(StatTile, { label: 'Team documents', value: totalTeamDocuments, variant: 'white', hint: 'Uploaded records' }),
              ]),
            ]),
            h('div', { className: 'card action-panel' }, [
              h('div', { className: 'panel-heading compact' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Fast actions'),
                  h('h3', null, 'Common HR tasks'),
                ]),
              ]),
              h('div', { className: 'action-list' }, [
                h('button', { className: 'action-button', onClick: () => { setAdminPage('team'); setTab('admin'); } }, [
                  h('span', null, 'Team directory'),
                  h('small', null, 'Create, edit, and review employees'),
                ]),
                h('button', { className: 'action-button', onClick: () => setTab('leave-approvals') }, [
                  h('span', null, 'Leave approvals'),
                  h('small', null, `${pendingLeaveRequests.length} waiting for review`),
                ]),
                h('button', { className: 'action-button', onClick: () => { setAdminPage('team'); setTab('admin'); } }, [
                  h('span', null, 'Manual attendance'),
                  h('small', null, 'Review monthly attendance status'),
                ]),
                h('button', { className: 'action-button', onClick: () => { setAdminPage('assignShift'); setTab('admin'); } }, [
                  h('span', null, 'Shift roster'),
                  h('small', null, `${employeesWithoutShift} employees need shifts`),
                ]),
              ]),
            ]),
            h('div', { className: 'card review-panel' }, [
              h('div', { className: 'panel-heading compact' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Approvals'),
                  h('h3', null, 'Pending decisions'),
                ]),
              ]),
              pendingLeaveRequests.length
                ? pendingLeaveRequests.slice(0, 4).map((leave) => h('div', { key: leave.id, className: 'review-row' }, [
                    h('div', null, [
                      h('strong', null, leave.employee ? leave.employee.name : `Employee #${leave.employeeId}`),
                      h('p', { className: 'muted' }, `${leave.leaveType} leave | ${leave.startDate} to ${leave.endDate}`),
                    ]),
                    h('span', { className: 'badge badge-pending small' }, leave.status.replace('_', ' ')),
                  ]))
                : h(EmptyState, { title: 'No pending leaves', message: 'All leave requests are clear right now.' }),
            ]),
            h('div', { className: 'card review-panel' }, [
              h('div', { className: 'panel-heading compact' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Roster health'),
                  h('h3', null, 'Team readiness'),
                ]),
              ]),
              h('div', { className: 'readiness-list' }, [
                h('div', null, [h('span', null, 'Admins'), h('strong', null, roleCounts.admin || 0)]),
                h('div', null, [h('span', null, 'Restaurant managers'), h('strong', null, roleCounts['restaurant-manager'] || 0)]),
                h('div', null, [h('span', null, 'Company managers'), h('strong', null, roleCounts['company-manager'] || 0)]),
                h('div', null, [h('span', null, 'Employees with shifts'), h('strong', null, employeesWithShift)]),
              ]),
            ]),
          ]),
          // Celebrations section - only show today's birthdays and anniversaries
          celebrations && (celebrations.birthdays.filter(b => b.isToday).length > 0 || celebrations.anniversaries.filter(a => a.isToday).length > 0) && h('div', { className: 'celebrations-card' }, [
            h('div', { className: 'celebrations-header' }, [
              h('span', { className: 'celebration-icon' }, '🎉'),
              h('h3', null, '🎊 Celebrating Today!'),
            ]),
            h('div', { className: 'celebrations-grid' }, [
              ...celebrations.birthdays.filter(b => b.isToday).map((b, i) => h('div', { key: `bday-${i}`, className: 'celebration-item today' }, [
                b.photoUrl
                  ? h('img', { src: b.photoUrl, className: 'celebration-avatar', alt: b.name })
                  : h('div', { className: 'celebration-avatar placeholder' }, initialsFrom(b.name)),
                h('div', { className: 'celebration-info' }, [
                  h('strong', null, `🎂 ${b.name}`),
                  h('span', null, `${b.designation || 'Team Member'} · ${b.employeeId}`),
                  h('span', { className: 'celebration-badge birthday' }, '🎈 Birthday Today!'),
                ]),
              ])),
              ...celebrations.anniversaries.filter(a => a.isToday).map((a, i) => h('div', { key: `ann-${i}`, className: 'celebration-item today' }, [
                a.photoUrl
                  ? h('img', { src: a.photoUrl, className: 'celebration-avatar', alt: a.name })
                  : h('div', { className: 'celebration-avatar placeholder' }, initialsFrom(a.name)),
                h('div', { className: 'celebration-info' }, [
                  h('strong', null, `🎉 ${a.name}`),
                  h('span', null, `${a.designation || 'Team Member'} · ${a.employeeId}`),
                  h('span', { className: 'celebration-badge anniversary' }, `🎊 ${a.years} Year Anniversary!`),
                ]),
              ])),
            ]),
          ]),

          h('div', { className: 'home-grid' }, [
            h('div', { className: 'card announcement-card' }, [
              h('h3', null, 'Announcements'),
              h('p', { className: 'muted' }, 'Welcome to your new Reyadah portal. Check attendance, payroll, and documents from one place.'),
              h('ul', { className: 'announcement-list' }, [
                h('li', null, 'Submit your monthly timesheet before the 28th.'),
                h('li', null, 'Payroll processing starts on the 1st of every month.'),
                h('li', null, 'Upload any HR documents for review.'),
              ]),
            ]),
            h('div', { className: 'card' }, [
              h('h3', null, 'Recent payslips'),
              payslips.length ? payslips.slice(-3).reverse().map((p) => h('div', { key: p.id, className: 'doc-item' }, [
                h('div', null, [
                  h('strong', null, `${p.month}/${p.year}`),
                  h('p', { className: 'muted' }, `Net: AED ${p.net}`),
                ]),
              ])) : h('p', { className: 'muted' }, 'No payslips available yet.'),
            ]),
            h('div', { className: 'card' }, [
              h('h3', null, 'Uploaded documents'),
              docs.length ? docs.slice(-3).map((doc, index) => h('div', { key: index, className: 'doc-item' }, [
                h('a', { href: doc.url, target: '_blank' }, doc.originalname),
                h('span', { className: 'muted' }, `${Math.round((doc.size || 0) / 1024)} KB`),
              ])) : h('p', { className: 'muted' }, 'No documents uploaded yet.'),
            ]),
          ]),
        ]),

        tab === 'tasks' && h('div', { className: 'grid' }, [
          h('div', { className: 'card tasks-page-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Task list'),
                h('h2', null, 'Today and pending work'),
              ]),
              h('button', { className: 'btn secondary small', onClick: () => {
                loadProfile();
                loadDocs();
                loadAttendance();
                loadLeaves();
                if (isTeamRole(user.role)) loadEmployees();
              } }, 'Refresh'),
            ]),
            h('div', { className: 'docs-list' }, taskItems.map((task, index) => h('div', { key: index, className: 'doc-item' }, [
              h('div', null, [
                h('strong', null, task.title),
                h('p', { className: 'muted' }, task.detail),
              ]),
              h('button', { className: 'btn secondary small', onClick: task.onAction }, task.actionLabel),
            ]))),
          ]),
        ]),

        tab === 'profile' && h('div', { className: 'grid' }, [
          h('div', { className: 'card profile-card' }, [
            h('div', { className: 'hero-header profile-hero' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'My Profile'),
                h('h2', null, `${user.name || user.employeeId}`),
                h('div', { className: 'hero-meta' }, [
                  h('span', { className: 'badge' }, `Employee No: ${user.employeeId}`),
                ]),
              ]),
              h('div', { className: 'profile-avatar-shell' }, [
                user.photoUrl
                  ? h('img', { src: user.photoUrl, className: 'profile-avatar', alt: user.name || 'Profile photo' })
                  : h('div', { className: 'profile-avatar placeholder' }, user.name ? user.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : '?'),
                h('input', {
                  id: 'profile-photo-input',
                  type: 'file',
                  accept: 'image/*',
                  style: { display: 'none' },
                  onChange: (e) => {
                    const f = e.target.files && e.target.files[0];
                    if (f) uploadPhoto(f);
                    e.target.value = '';
                  },
                }),
                h('button', {
                  className: 'btn white small',
                  onClick: () => document.getElementById('profile-photo-input').click(),
                }, 'Upload photo'),
              ]),
            ]),
            h('div', { className: 'profile-detail-grid' }, [
              h('div', null, [
                h('p', { className: 'detail-label' }, 'Email'),
                h('p', null, user.email || '—'),
              ]),
              h('div', null, [
                h('p', { className: 'detail-label' }, 'Role'),
                h('p', null, user.role),
              ]),
              h('div', null, [
                h('p', { className: 'detail-label' }, 'Salary'),
                h('p', null, `AED ${user.salary || 0}`),
              ]),
              h('div', null, [
                h('p', { className: 'detail-label' }, 'Joined'),
                h('p', null, user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'),
              ]),
            ]),
            h('div', { className: 'section' }, [
              h('h3', null, 'Documents'),
              user.documents && user.documents.length
                ? user.documents.map((doc, index) => h('div', { key: index, className: 'doc-item' }, [
                    h('div', null, [
                      h('a', { href: doc.url, target: '_blank' }, doc.originalname),
                      h('p', { className: 'muted' }, [
                        `${doc.docType || 'General'} · ${Math.round((doc.size || 0) / 1024)} KB · Uploaded ${new Date(doc.uploadedAt).toLocaleString()}`,
                        doc.issueDate ? ` · Issued: ${new Date(doc.issueDate).toLocaleDateString()}` : '',
                        doc.expiryDate ? ` · Expires: ${new Date(doc.expiryDate).toLocaleDateString()}` : '',
                        doc.description ? ` · ${doc.description}` : '',
                      ]),
                    ]),
                    h('a', { href: doc.url, target: '_blank', className: 'btn white small', style: { textDecoration: 'none' } }, '📄 View'),
                  ]))
                : h('p', { className: 'muted' }, 'No documents uploaded yet.'),
              // Profile document upload form
              h('div', { className: 'upload-row', style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                h('label', { className: 'field' }, ['Type', h('input', { type: 'text', value: profileDocMeta.docType, onChange: (e) => setProfileDocMeta(prev => ({ ...prev, docType: e.target.value })), placeholder: 'Contract, ID, Payslip' })]),
                h('label', { className: 'field' }, ['Issue date', h('input', { type: 'date', value: profileDocMeta.issueDate, onChange: (e) => setProfileDocMeta(prev => ({ ...prev, issueDate: e.target.value })) })]),
                h('label', { className: 'field' }, ['Expiry date', h('input', { type: 'date', value: profileDocMeta.expiryDate, onChange: (e) => setProfileDocMeta(prev => ({ ...prev, expiryDate: e.target.value })) })]),
                h('label', { className: 'field' }, ['Notes', h('input', { type: 'text', value: profileDocMeta.description, onChange: (e) => setProfileDocMeta(prev => ({ ...prev, description: e.target.value })), placeholder: 'Optional notes' })]),
                h('input', { type: 'file', onChange: (e) => setProfileDocFile(e.target.files[0]) }),
              ]),
              h('button', { className: 'btn primary', onClick: uploadProfileDocument, style: { marginTop: '8px' } }, 'Add document'),
            ]),
                      h('div', { className: 'section' }, [
                        h('h3', null, 'My Assets'),
                        user.assets && user.assets.length
                          ? user.assets.map((asset) => h('div', { key: asset.id, className: 'doc-item asset-item' }, [
                              h('div', null, [
                                h('strong', null, `${asset.name} (${asset.assetType || asset.assetTag || 'Asset'})`),
                                h('p', { className: 'muted' }, `${asset.serialNumber ? 'SN: ' + asset.serialNumber + ' · ' : ''}${asset.description || ''}`),
                              ]),
                              h('div', { className: 'asset-meta' }, [
                                h('p', { className: 'muted' }, `Assigned ${new Date(asset.assignedAt).toLocaleString()}`),
                                h('p', { className: 'muted' }, `Status: ${asset.status}`),
                              ]),
                            ]))
                          : h('p', { className: 'muted' }, 'No assets assigned.'),
                      ]),
            h('div', { className: 'section' }, [
              h('h3', null, 'Attendance'),
              attendanceRecords.length
                ? attendanceRecords.map((record) => h('div', { key: record.id, className: 'doc-item attendance-record' }, [
                    h('div', { className: 'attendance-record-main' }, [
                      h('strong', null, record.date),
                      h('p', { className: 'muted' }, `In: ${record.clockIn ? new Date(record.clockIn).toLocaleTimeString() : '-'} | Out: ${record.clockOut ? new Date(record.clockOut).toLocaleTimeString() : '-'}`),
                    ]),
                    h('div', { className: 'attendance-selfies', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
                      record.clockInPhotoUrl && h('a', { href: record.clockInPhotoUrl, target: '_blank', title: 'Clock-in selfie' }, [
                        h('img', { src: record.clockInPhotoUrl, className: 'selfie-thumb', alt: 'Clock-in selfie', style: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '2px solid var(--border)' } }),
                      ]),
                      record.clockOutPhotoUrl && h('a', { href: record.clockOutPhotoUrl, target: '_blank', title: 'Clock-out selfie' }, [
                        h('img', { src: record.clockOutPhotoUrl, className: 'selfie-thumb', alt: 'Clock-out selfie', style: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '2px solid var(--border)' } }),
                      ]),
                    ]),
                  ]))
                : h('p', { className: 'muted' }, 'No attendance records yet.'),
            ]),
            h('div', { className: 'section' }, [
              h('h3', null, 'Payslips'),
              payslips.length
                ? payslips.map((p) => h('div', { key: p.id, className: 'doc-item' }, [
                    h('div', null, [
                      h('strong', null, `${p.month}/${p.year}`),
                      h('p', { className: 'muted' }, `Gross: AED ${p.gross}, Net: AED ${p.net}`),
                    ]),
                  ]))
                : h('p', { className: 'muted' }, 'No payslips available yet.'),
            ]),
          ]),
        ]),
        tab === 'shift-roster' && canView('shift-roster') && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'hero-header' }, [
              h('div', null, [h('p', { className: 'eyebrow' }, 'Shift Roster'), h('h2', null, 'Monthly Shift Roster')]),
              h('div', { className: 'hero-meta' }, [
                h('label', { className: 'field' }, [
                  'Year', h('input', { type: 'number', value: attendanceEditorYear, onChange: (e) => setAttendanceEditorYear(parseInt(e.target.value||new Date().getFullYear(),10)) })
                ]),
                h('label', { className: 'field' }, [
                  'Month', h('input', { type: 'number', min:1, max:12, value: attendanceEditorMonth, onChange: (e) => setAttendanceEditorMonth(Math.min(12, Math.max(1, parseInt(e.target.value||1,10)))) })
                ]),
                h('button', { className: 'btn secondary', onClick: async () => await loadShiftRoster(attendanceEditorYear, attendanceEditorMonth) }, 'Load roster')
              ])
            ]),

            h('div', { className: 'roster-table', style: { overflowX: 'auto' } }, [
              h('table', { className: 'compact-roster' }, [
                h('thead', null, h('tr', null, [
                  h('th', null, 'Employee'),
                  ...Array.from({ length: new Date(attendanceEditorYear, attendanceEditorMonth, 0).getDate() }).map((_,i) => h('th', { key: i }, String(i+1)))
                ])),
                h('tbody', null, (employees || []).map(emp => {
                  const row = rosterMatrix[emp.employeeId] || [];
                  return h('tr', { key: emp.employeeId }, [
                    h('td', null, emp.name || emp.employeeId),
                    ...Array.from({ length: new Date(attendanceEditorYear, attendanceEditorMonth, 0).getDate() }).map((_, idx) => {
                      const d = idx + 1;
                      const cell = row.find(c => c.day === d) || { day: d, shift: '' };
                      return h('td', { key: idx, className: 'roster-cell' }, [
                        h('input', { value: cell.shift || '', onChange: (e) => updateRosterCell(emp.employeeId, d, e.target.value), style: { width: 64 } })
                      ]);
                    })
                  ]);
                }))
              ])
            ]),

            h('div', { className: 'form-actions' }, [
              h('button', { className: 'btn primary', onClick: async () => await saveRosterChanges() }, 'Save roster'),
              h('button', { className: 'btn secondary', onClick: async () => await loadShiftRoster(attendanceEditorYear, attendanceEditorMonth) }, 'Reload')
            ])
          ])
        ]),

        tab === 'attendance-editor' && canView('attendance-editor') && h('div', { className: 'card' }, [
          h('div', { className: 'panel-heading' }, [
            h('div', null, [
              h('p', { className: 'eyebrow' }, 'Manual attendance'),
              h('h2', null, 'Choose an employee to edit'),
              h('p', { className: 'muted' }, 'Manual attendance editing is available from an employee profile in the admin workspace.'),
            ]),
            h('button', { className: 'btn secondary small', onClick: () => { setAdminPage('team'); setTab('admin'); } }, 'Open team directory'),
          ]),
          user.role === 'admin' && employees.length ? h('div', { className: 'form-grid compact-form' }, [
            h('label', { className: 'field' }, [
              'Employee',
              h('select', {
                value: selectedEmployeeId,
                onChange: (event) => {
                  setSelectedEmployeeId(event.target.value);
                  if (event.target.value) loadEmployeeDetails(event.target.value);
                },
              }, [
                h('option', { value: '' }, 'Select employee'),
                employees.map((employee) => h('option', { key: employee.id, value: employee.employeeId }, `${employee.name} (${employee.employeeId})`)),
              ]),
            ]),
            selectedEmployeeDetails && h('div', { className: 'doc-item' }, [
              h('div', null, [
                h('strong', null, selectedEmployeeDetails.name || selectedEmployeeDetails.employeeId),
                h('p', { className: 'muted' }, `${selectedEmployeeDetails.designation || 'No designation'} | ${formatRole(selectedEmployeeDetails.role)}`),
              ]),
              h('button', { className: 'btn primary small', onClick: () => { setAdminPage('team'); setTab('admin'); } }, 'Open profile'),
            ]),
          ]) : h(EmptyState, {
            title: 'Team list unavailable',
            message: 'Open an employee profile from the admin team directory to edit monthly attendance.',
            actionLabel: user.role === 'admin' ? 'Open team directory' : null,
            onAction: () => { setAdminPage('team'); setTab('admin'); },
          }),
        ]),

        tab === 'attendance-info' && canView('attendance-info') && h('div', { className: 'attendance-info-page' }, [
          h('div', { className: 'card attendance-info-hero' }, [
            h('div', { className: 'panel-heading attendance-info-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Team attendance'),
                h('h2', null, 'Attendance Info'),
                h('p', { className: 'muted' }, `Month-wise details for ${formatAttendanceMonth(attendanceInfoYear, attendanceInfoMonth)}`),
              ]),
              h('div', { className: 'attendance-info-controls' }, [
                h('button', { className: 'btn secondary small', onClick: () => moveAttendanceInfoMonth(-1) }, 'Prev'),
                h('label', { className: 'field compact-field' }, [
                  'Month',
                  h('select', {
                    value: attendanceInfoMonth,
                    onChange: (event) => setAttendanceInfoMonth(Number(event.target.value)),
                  }, MONTH_NAMES.map((monthName, index) => h('option', { key: monthName, value: index + 1 }, monthName))),
                ]),
                h('label', { className: 'field compact-field year-field' }, [
                  'Year',
                  h('input', {
                    type: 'number',
                    value: attendanceInfoYear,
                    onChange: (event) => setAttendanceInfoYear(parseInt(event.target.value || new Date().getFullYear(), 10)),
                  }),
                ]),
                h('button', { className: 'btn primary small', onClick: () => loadAttendanceInfo(attendanceInfoYear, attendanceInfoMonth) }, attendanceInfoLoading ? 'Loading...' : 'Load month'),
                h('button', { className: 'btn secondary small', onClick: () => moveAttendanceInfoMonth(1) }, 'Next'),
              ]),
            ]),

            h('div', { className: 'attendance-kpi-grid' }, [
              ['Employees', attendanceInfoSummary.employees || 0, `${attendanceInfoReport?.daysInMonth || 0} days in month`],
              ['Present days', attendanceInfoSummary.present || 0, `${attendanceInfoSummary.fullDays || 0} full days`],
              ['Half days', attendanceInfoSummary.halfDays || 0, `${attendanceInfoSummary.inProgress || 0} in progress`],
              ['Absent days', attendanceInfoSummary.absent || 0, `${attendanceInfoSummary.notMarked || 0} not marked`],
              ['Holiday days', attendanceInfoSummary.holiday || 0, 'Marked O'],
              ['Total hours', formatAttendanceMinutes(attendanceInfoSummary.totalWorkingMinutes || 0), 'All employees'],
            ].map(([label, value, hint]) => h('div', { key: label, className: 'attendance-kpi' }, [
              h('span', null, label),
              h('strong', null, value),
              h('small', null, hint),
            ]))),

            h('div', { className: 'attendance-legend-panel' }, [
              h('span', { className: 'legend-title' }, 'Legend'),
              ...ATTENDANCE_LEGEND_ITEMS.map((item) => h('span', { key: item.code, className: 'attendance-legend-item' }, [
                h('span', { className: `attendance-status-chip ${item.className}` }, item.code),
                h('span', null, item.label),
              ])),
            ]),
          ]),

          h('div', { className: 'card attendance-info-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Employee Lookup'),
                h('h2', null, 'Search employee by ID or name'),
                h('p', { className: 'muted' }, 'Type an employee ID or name to view their monthly attendance details.'),
              ]),
              h('div', { className: 'directory-controls attendance-info-filters' }, [
                h('input', {
                  value: attendanceInfoLookupQuery,
                  onChange: (event) => {
                    setAttendanceInfoLookupQuery(event.target.value);
                    searchAttendanceEmployee(event.target.value);
                  },
                  placeholder: 'Search by employee ID or name',
                }),
                attendanceInfoLookupBusy && h('span', { className: 'badge' }, 'Searching...'),
              ]),
            ]),

            attendanceInfoLookupSelectedEmployee && attendanceInfoLookupMonthData
              ? (() => {
                  const emp = attendanceInfoLookupSelectedEmployee;
                  const days = attendanceInfoLookupMonthData.days || [];
                  const daysInMonth = new Date(attendanceInfoLookupMonthData.year, attendanceInfoLookupMonthData.month, 0).getDate();
                  const summary = { present: 0, absent: 0, holiday: 0, notMarked: 0 };
                  days.forEach((d) => {
                    const s = (d.status || '').toLowerCase();
                    if (s === 'p') summary.present++;
                    else if (s === 'a') summary.absent++;
                    else if (s === 'o') summary.holiday++;
                    else summary.notMarked++;
                  });
                  const rosterText = emp.shiftRoster?.shiftName
                    ? `${emp.shiftRoster.shiftName} ${emp.shiftRoster.startTime || ''}-${emp.shiftRoster.endTime || ''}`.trim()
                    : 'Shift unassigned';

                  return h('div', { className: 'attendance-employee-report' }, [
                    h('div', { className: 'attendance-employee-head' }, [
                      h('div', { className: 'employee-info' }, [
                        emp.photoUrl
                          ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name || 'Employee photo' })
                          : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name, emp.employeeId)),
                        h('div', { className: 'employee-meta' }, [
                          h('div', { className: 'employee-name-line' }, [
                            h('strong', null, emp.name || 'Unnamed employee'),
                            h('span', { className: 'employee-id-pill' }, emp.employeeId || 'Missing ID'),
                            h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                          ]),
                          h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                          h('p', { className: 'muted employee-shift-note' }, rosterText),
                          h('p', { className: 'muted' }, `Attendance for ${formatAttendanceMonth(attendanceInfoLookupMonthData.year, attendanceInfoLookupMonthData.month)}`),
                        ]),
                      ]),
                      h('div', { className: 'attendance-employee-metrics' }, [
                        h('span', null, [h('strong', null, `${daysInMonth} days`), h('small', null, 'Month')]),
                        h('span', null, [h('strong', null, summary.present), h('small', null, 'P')]),
                        h('span', null, [h('strong', null, summary.absent), h('small', null, 'A')]),
                        h('span', null, [h('strong', null, summary.holiday), h('small', null, 'O')]),
                        h('span', null, [h('strong', null, summary.notMarked), h('small', null, 'NS')]),
                      ]),
                    ]),

                    days.length
                      ? h('div', { className: 'attendance-detail-table' }, [
                          h('table', null, [
                            h('thead', null, h('tr', null, [
                              h('th', null, 'Date'),
                              h('th', null, 'Status'),
                              h('th', null, 'Photos'),
                              h('th', null, 'Enter'),
                              h('th', null, 'Exit'),
                              h('th', null, 'Shift'),
                            ])),
                            h('tbody', null, days.map((day) => h('tr', { key: day.date }, [
                              h('td', { className: 'attendance-date-cell' }, [
                                h('strong', null, day.day),
                                h('span', null, new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })),
                              ]),
                              h('td', null, h('span', { className: `attendance-status-chip ${attendanceStatusClass(day.status)}` }, day.status ? day.status.toUpperCase() : 'NS')),
                              h('td', { className: 'attendance-selfie-cell' }, [
                                day.clockInPhotoUrl && h('a', { href: day.clockInPhotoUrl, target: '_blank', title: 'Clock-in selfie' }, 
                                  h('img', { src: day.clockInPhotoUrl, className: 'selfie-thumb-table', alt: 'In' })
                                ),
                                day.clockOutPhotoUrl && h('a', { href: day.clockOutPhotoUrl, target: '_blank', title: 'Clock-out selfie' }, 
                                  h('img', { src: day.clockOutPhotoUrl, className: 'selfie-thumb-table', alt: 'Out' })
                                ),
                                !day.clockInPhotoUrl && !day.clockOutPhotoUrl && h('span', { className: 'muted' }, '-'),
                              ]),
                              h('td', null, formatAttendanceTime(day.clockIn)),
                              h('td', null, formatAttendanceTime(day.clockOut)),
                              h('td', null, day.shift || '-'),
                            ]))),
                          ]),
                        ])
                      : h('p', { className: 'muted' }, 'No attendance records for this month.'),
                    
                    h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [
                      h('button', { className: 'btn secondary small', onClick: () => {
                        setAttendanceInfoLookupQuery('');
                        setAttendanceInfoLookupResults([]);
                        setAttendanceInfoLookupSelectedEmployee(null);
                        setAttendanceInfoLookupMonthData(null);
                      } }, 'Clear search'),
                    ]),
                  ]);
                })()
              : null,

            h('div', { className: 'section', style: { marginTop: attendanceInfoLookupSelectedEmployee ? '24px' : 0 } }, [
              h('h3', null, attendanceInfoLookupSelectedEmployee ? 'Team overview' : 'Monthly detail'),
              h('p', { className: 'muted' }, attendanceInfoLookupSelectedEmployee
                ? 'Team attendance overview shown below.'
                : attendanceInfoReport ? `${attendanceInfoEmployees.length} of ${(attendanceInfoReport.employees || []).length} employees shown` : 'Load a month to review employee attendance.'
              ),
            ]),

            h('div', { className: 'directory-controls attendance-info-filters' }, [
              h('input', {
                value: attendanceInfoSearch,
                onChange: (event) => setAttendanceInfoSearch(event.target.value),
                placeholder: 'Search employee, ID, role',
              }),
              h('select', {
                value: attendanceInfoStatusFilter,
                onChange: (event) => setAttendanceInfoStatusFilter(event.target.value),
              }, [
                h('option', { value: 'all' }, 'All days'),
                h('option', { value: 'p' }, 'Present (P)'),
                h('option', { value: 'a' }, 'Absent (A)'),
                h('option', { value: 'o' }, 'Holiday (O)'),
                h('option', { value: 'full-day' }, 'Full day'),
                h('option', { value: 'half-day' }, 'Half day'),
                h('option', { value: 'not-marked' }, 'Not marked'),
              ]),
            ]),

            // Show search results if there is a query
            attendanceInfoLookupQuery && attendanceInfoLookupResults.length > 0 && !attendanceInfoLookupSelectedEmployee
              ? h('div', { className: 'attendance-search-results', style: { marginBottom: '16px' } }, attendanceInfoLookupResults.map((emp) => h('div', {
                  key: emp.id,
                  className: 'doc-item employee-row',
                  style: { cursor: 'pointer' },
                  onClick: async () => {
                    setAttendanceInfoLookupSelectedEmployee(emp);
                    setAttendanceInfoLookupResults([]);
                    await loadAttendanceLookupForEmployee(emp.employeeId, attendanceInfoYear, attendanceInfoMonth);
                  },
                }, [
                  h('div', { className: 'employee-info' }, [
                    emp.photoUrl
                      ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name || 'Employee photo' })
                      : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name, emp.employeeId)),
                    h('div', { className: 'employee-meta' }, [
                      h('div', { className: 'employee-name-line' }, [
                        h('strong', null, emp.name || 'Unnamed employee'),
                        h('span', { className: 'employee-id-pill' }, emp.employeeId || 'Missing ID'),
                        h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                      ]),
                      h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                    ]),
                  ]),
                  h('span', { className: 'badge badge-pending' }, 'View attendance'),
                ])))
              : null,

            attendanceInfoLookupQuery && attendanceInfoLookupResults.length === 0 && !attendanceInfoLookupBusy && !attendanceInfoLookupSelectedEmployee
              ? h('p', { className: 'muted', style: { marginBottom: '16px' } }, 'No employees match your search.')
              : null,

            attendanceInfoLoading ? h('p', { className: 'muted' }, 'Loading attendance information...')
              : !attendanceInfoReport ? h(EmptyState, {
                title: 'No attendance report loaded',
                message: 'Choose a month and load the report to see all employee attendance details.',
                actionLabel: 'Load current month',
                onAction: () => loadAttendanceInfo(attendanceInfoYear, attendanceInfoMonth),
              })
              : attendanceInfoEmployees.length ? attendanceInfoEmployees.map((employee) => {
                const summary = employee.summary || {};
                const visibleDays = employee.visibleDays || [];
                const rosterText = employee.shiftRoster?.shiftName
                  ? `${employee.shiftRoster.shiftName} ${employee.shiftRoster.startTime || ''}-${employee.shiftRoster.endTime || ''}`.trim()
                  : 'Shift unassigned';

                return h('div', { key: employee.id, className: 'attendance-employee-report' }, [
                  h('div', { className: 'attendance-employee-head' }, [
                    h('div', { className: 'employee-info' }, [
                      employee.photoUrl
                        ? h('img', { src: employee.photoUrl, className: 'employee-avatar', alt: employee.name || 'Employee photo' })
                        : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(employee.name, employee.employeeId)),
                      h('div', { className: 'employee-meta' }, [
                        h('div', { className: 'employee-name-line' }, [
                          h('strong', null, employee.name || 'Unnamed employee'),
                          h('span', { className: 'employee-id-pill' }, employee.employeeId || 'Missing ID'),
                          h('span', { className: `employee-role-pill role-${employee.role || 'employee'}` }, formatRole(employee.role)),
                        ]),
                        h('p', { className: 'employee-summary' }, `${employee.email || 'No email'} | ${employee.designation || 'No designation'}`),
                        h('p', { className: 'muted employee-shift-note' }, rosterText),
                      ]),
                    ]),
                    h('div', { className: 'attendance-employee-metrics' }, [
                      h('span', null, [h('strong', null, formatAttendanceMinutes(summary.totalWorkingMinutes || 0)), h('small', null, 'Hours')]),
                      h('span', null, [h('strong', null, summary.present || 0), h('small', null, 'P')]),
                      h('span', null, [h('strong', null, summary.absent || 0), h('small', null, 'A')]),
                      h('span', null, [h('strong', null, summary.holiday || 0), h('small', null, 'O')]),
                      h('span', null, [h('strong', null, `${summary.fullDays || 0}/${summary.halfDays || 0}`), h('small', null, 'FD/HD')]),
                    ]),
                  ]),

                  h('div', { className: 'attendance-detail-table' }, [
                      h('table', null, [
                        h('thead', null, h('tr', null, [
                          h('th', null, 'Date'),
                          h('th', null, 'Status'),
                          h('th', null, 'Photos'),
                          h('th', null, 'Enter'),
                          h('th', null, 'Exit'),
                          h('th', null, 'Work type'),
                          h('th', null, 'Hours'),
                          h('th', null, 'Shift'),
                        ])),
                        h('tbody', null, visibleDays.map((day) => h('tr', { key: day.date }, [
                          h('td', { className: 'attendance-date-cell' }, [
                            h('strong', null, day.day),
                            h('span', null, day.weekday || ''),
                          ]),
                          h('td', null, h('span', { className: `attendance-status-chip ${attendanceStatusClass(day.status)}` }, day.status ? day.status.toUpperCase() : 'NS')),
                          h('td', { className: 'attendance-selfie-cell' }, [
                            day.clockInPhotoUrl && h('a', { href: day.clockInPhotoUrl, target: '_blank', title: 'Clock-in selfie' }, 
                              h('img', { src: day.clockInPhotoUrl, className: 'selfie-thumb-table', alt: 'In' })
                            ),
                            day.clockOutPhotoUrl && h('a', { href: day.clockOutPhotoUrl, target: '_blank', title: 'Clock-out selfie' }, 
                              h('img', { src: day.clockOutPhotoUrl, className: 'selfie-thumb-table', alt: 'Out' })
                            ),
                            !day.clockInPhotoUrl && !day.clockOutPhotoUrl && h('span', { className: 'muted' }, '-'),
                          ]),
                          h('td', null, formatAttendanceTime(day.clockIn)),
                          h('td', null, formatAttendanceTime(day.clockOut)),
                          h('td', null, h('span', { className: `work-type-pill ${attendanceWorkTypeClass(day.workType)}` }, day.workType || 'Not marked')),
                          h('td', null, formatAttendanceMinutes(day.workingMinutes || 0)),
                          h('td', null, day.shift || employee.shiftRoster?.shiftName || '-'),
                        ]))),
                      ]),
                  ]),
                ]);
              }) : h(EmptyState, {
                title: 'No matching attendance rows',
                message: 'Try a different search term or status filter.',
                actionLabel: 'Clear filters',
                onAction: () => {
                  setAttendanceInfoSearch('');
                  setAttendanceInfoStatusFilter('all');
                },
              }),
          ]),
        ]),

        tab === 'attendance' && h('div', { className: 'card' }, [
          h('h2', null, 'Attendance history'),
          attendanceRecords.length ? attendanceRecords.map((record) => h('div', { key: record.id, className: 'doc-item attendance-record' }, [
            h('div', { className: 'attendance-record-main' }, [
              h('strong', null, record.date),
              h('p', { className: 'muted' }, `In: ${record.clockIn ? new Date(record.clockIn).toLocaleTimeString() : '-'} | Out: ${record.clockOut ? new Date(record.clockOut).toLocaleTimeString() : '-'}`),
            ]),
            h('div', { className: 'attendance-selfies', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
              record.clockInPhotoUrl && h('a', { href: record.clockInPhotoUrl, target: '_blank', title: 'Clock-in selfie' }, [
                h('img', { src: record.clockInPhotoUrl, className: 'selfie-thumb', alt: 'Clock-in selfie', style: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '2px solid var(--border)' } }),
              ]),
              record.clockOutPhotoUrl && h('a', { href: record.clockOutPhotoUrl, target: '_blank', title: 'Clock-out selfie' }, [
                h('img', { src: record.clockOutPhotoUrl, className: 'selfie-thumb', alt: 'Clock-out selfie', style: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '2px solid var(--border)' } }),
              ]),
            ]),
          ])) : h('p', { className: 'muted' }, 'No attendance records available.'),
        ]),

        tab === 'documents' && h('div', { className: 'card' }, [
          h('h2', null, 'Documents'),
          h('div', { className: 'upload-row' }, [
            h('label', { className: 'field' }, [
              'Document type',
              h('input', {
                type: 'text',
                value: documentMeta.docType,
                onChange: (event) => setDocumentMeta((prev) => ({ ...prev, docType: event.target.value })),
                placeholder: 'Contract, ID, Payslip',
              }),
            ]),
            h('label', { className: 'field' }, [
              'Issue date',
              h('input', {
                type: 'date',
                value: documentMeta.issueDate,
                onChange: (event) => setDocumentMeta((prev) => ({ ...prev, issueDate: event.target.value })),
              }),
            ]),
            h('label', { className: 'field' }, [
              'Expiry date',
              h('input', {
                type: 'date',
                value: documentMeta.expiryDate,
                onChange: (event) => setDocumentMeta((prev) => ({ ...prev, expiryDate: event.target.value })),
              }),
            ]),
            h('label', { className: 'field' }, [
              'Description',
              h('input', {
                type: 'text',
                value: documentMeta.description,
                onChange: (event) => setDocumentMeta((prev) => ({ ...prev, description: event.target.value })),
                placeholder: 'Optional details',
              }),
            ]),
            h('input', {
              type: 'file',
              onChange: (event) => uploadDocument(event.target.files[0]),
            }),
          ]),
          docs.length ? docs.map((doc, index) => h('div', { key: index, className: 'doc-item' }, [
            h('div', null, [
              h('a', { href: doc.url, target: '_blank' }, doc.originalname),
              h('p', { className: 'muted' }, `${doc.docType || 'General'} · ${doc.description || 'No details'} · Uploaded ${new Date(doc.uploadedAt).toLocaleDateString()}${doc.expiryDate ? ` · Expires: ${new Date(doc.expiryDate).toLocaleDateString()}` : ''}${doc.issueDate ? ` · Issued: ${new Date(doc.issueDate).toLocaleDateString()}` : ''}`),
            ]),
          ])) : h('p', { className: 'muted' }, 'No documents uploaded yet.'),
        ]),

        tab === 'requests' && h('div', { className: 'req-shell' }, [
          // Hero / Overview
          h('div', { className: 'req-hero card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Request Hub'),
                h('h2', null, 'Manage your requests'),
                h('p', { className: 'muted' }, 'Submit tickets, expense claims, loan applications, and leave requests all in one place.'),
              ]),
            ]),
            h('div', { className: 'req-tabs' },
              [
                ['tickets', '🎫', 'Tickets', 'Create support tickets for attendance, WFH, and more'],
                ['expenses', '💰', 'Expenses', 'Claim company expenses with invoices'],
                ['medical', '🏥', 'Medical', 'Submit medical expense reimbursements'],
                ['air-tickets', '✈️', 'Air Tickets', 'Request air ticket reimbursement or travel tickets'],
                ['loans', '🏦', 'Loans', 'Apply for up to 2,000 AED with EMI'],
              ].map(function(tabInfo) {
                const key = tabInfo[0], icon = tabInfo[1], label = tabInfo[2], desc = tabInfo[3];
                return h('button', {
                  key: key,
                  className: 'req-tab-btn' + (reqTab === key ? ' active' : ''),
                  onClick: function() { setReqTab(key); loadReqData(key); },
                }, [
                  h('span', { className: 'req-tab-icon' }, icon),
                  h('div', null, [
                    h('strong', null, label),
                    h('p', { className: 'muted' }, desc),
                  ]),
                ]);
              }),
            ),
          ]),

          // ===== TICKETS SECTION =====
          reqTab === 'tickets' && h('div', { className: 'req-grid' }, [
            h('div', { className: 'card req-form-card' }, [
              h('div', { className: 'req-form-header' }, [
                h('span', { className: 'req-form-icon' }, '🎫'),
                h('div', null, [
                  h('strong', null, 'Create a Ticket'),
                  h('p', { className: 'muted' }, 'Report issues or request services'),
                ]),
              ]),
              h('label', { className: 'field' }, ['Subject', h('input', { value: ticketForm.subject, onChange: function(e) { ticketForm.subject = e.target.value; setTicketForm(Object.assign({}, ticketForm)); }, placeholder: 'e.g. Attendance correction for March 15' })]),
              h('label', { className: 'field' }, ['Category', h('select', { value: ticketForm.category, onChange: function(e) { ticketForm.category = e.target.value; setTicketForm(Object.assign({}, ticketForm)); } }, [
                h('option', { value: 'attendance' }, 'Attendance Correction'),
                h('option', { value: 'work-from-home' }, 'Work From Home'),
                h('option', { value: 'shift-change' }, 'Shift Change'),
                h('option', { value: 'technical' }, 'Technical Issue'),
                h('option', { value: 'hr' }, 'HR Query'),
                h('option', { value: 'other' }, 'Other'),
              ])]),
              h('label', { className: 'field' }, ['Priority', h('select', { value: ticketForm.priority, onChange: function(e) { ticketForm.priority = e.target.value; setTicketForm(Object.assign({}, ticketForm)); } }, [
                h('option', { value: 'low' }, 'Low'),
                h('option', { value: 'medium' }, 'Medium'),
                h('option', { value: 'high' }, 'High'),
                h('option', { value: 'urgent' }, 'Urgent'),
              ])]),
              h('label', { className: 'field' }, ['Description', h('textarea', { value: ticketForm.description, onChange: function(e) { ticketForm.description = e.target.value; setTicketForm(Object.assign({}, ticketForm)); }, rows: 4, placeholder: 'Describe your request in detail...' })]),
              h('button', { className: 'btn primary', onClick: submitTicket, disabled: reqBusy || !ticketForm.subject || !ticketForm.description }, reqBusy ? 'Submitting...' : 'Submit Ticket'),
            ]),
            h('div', { className: 'card req-list-card' }, [
              h('div', { className: 'req-list-header' }, [
                h('div', null, [
                  h('strong', null, 'My Tickets'),
                  h('p', { className: 'muted' }, tickets.length + ' total'),
                ]),
                h('button', { className: 'btn white small', onClick: function() { loadReqData('tickets'); } }, 'Refresh'),
              ]),
              tickets.length === 0
                ? h(EmptyState, { title: 'No tickets yet', message: 'Create a ticket above to get started.' })
                : h('div', { className: 'req-items' }, tickets.map(function(t) {
                    return h('div', { key: t.id, className: 'req-item' }, [
                      h('div', { className: 'req-item-header' }, [
                        h('div', null, [
                          h('strong', null, t.subject),
                          h('p', { className: 'muted' }, t.category.replace('-', ' ') + ' · ' + new Date(t.createdAt).toLocaleDateString()),
                        ]),
                        h('span', { className: 'req-badge status-' + t.status }, t.status),
                        t.priority && h('span', { className: 'req-badge priority-' + t.priority }, t.priority),
                      ]),
                      h('p', { className: 'req-item-desc' }, t.description),
                      t.adminResponse && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Admin Response:'),
                        h('p', null, t.adminResponse),
                      ]),
                    ]);
                  })),
            ]),
          ]),

          // ===== EXPENSES SECTION =====
          reqTab === 'expenses' && h('div', { className: 'req-grid' }, [
            h('div', { className: 'card req-form-card' }, [
              h('div', { className: 'req-form-header' }, [
                h('span', { className: 'req-form-icon' }, '💰'),
                h('div', null, [
                  h('strong', null, 'Claim an Expense'),
                  h('p', { className: 'muted' }, 'Get reimbursed for company purchases'),
                ]),
              ]),
              h('label', { className: 'field' }, ['Amount (AED)', h('input', { type: 'number', value: expenseForm.amount, onChange: function(e) { expenseForm.amount = e.target.value; setExpenseForm(Object.assign({}, expenseForm)); }, placeholder: 'e.g. 150.00' })]),
              h('label', { className: 'field' }, ['Category', h('select', { value: expenseForm.category, onChange: function(e) { expenseForm.category = e.target.value; setExpenseForm(Object.assign({}, expenseForm)); } }, [
                h('option', { value: 'travel' }, 'Travel'),
                h('option', { value: 'office-supplies' }, 'Office Supplies'),
                h('option', { value: 'meals' }, 'Meals'),
                h('option', { value: 'transport' }, 'Transport'),
                h('option', { value: 'utilities' }, 'Utilities'),
                h('option', { value: 'other' }, 'Other'),
              ])]),
              h('label', { className: 'field' }, ['Expense Date', h('input', { type: 'date', value: expenseForm.expenseDate, onChange: function(e) { expenseForm.expenseDate = e.target.value; setExpenseForm(Object.assign({}, expenseForm)); } })]),
              h('label', { className: 'field' }, ['Description', h('textarea', { value: expenseForm.description, onChange: function(e) { expenseForm.description = e.target.value; setExpenseForm(Object.assign({}, expenseForm)); }, rows: 3, placeholder: 'What was this expense for?' })]),
              h('label', { className: 'field' }, ['Invoice / Receipt', h('input', { type: 'file', onChange: function(e) { expenseFile = e.target.files && e.target.files[0]; setExpenseFile(expenseFile); } })]),
              expenseFile && h('p', { className: 'req-file-name' }, '📎 ' + expenseFile.name),
              h('button', { className: 'btn primary', onClick: submitExpense, disabled: reqBusy || !expenseForm.amount || !expenseForm.description || !expenseForm.expenseDate }, reqBusy ? 'Submitting...' : 'Submit Expense'),
            ]),
            h('div', { className: 'card req-list-card' }, [
              h('div', { className: 'req-list-header' }, [
                h('div', null, [
                  h('strong', null, 'My Expenses'),
                  h('p', { className: 'muted' }, expenses.length + ' total · ' + expenses.reduce(function(s, e) { return s + Number(e.amount); }, 0).toFixed(2) + ' AED'),
                ]),
                h('button', { className: 'btn white small', onClick: function() { loadReqData('expenses'); } }, 'Refresh'),
              ]),
              expenses.length === 0
                ? h(EmptyState, { title: 'No expenses yet', message: 'Submit your first expense claim above.' })
                : h('div', { className: 'req-items' }, expenses.map(function(e) {
                    return h('div', { key: e.id, className: 'req-item' }, [
                      h('div', { className: 'req-item-header' }, [
                        h('div', null, [
                          h('strong', null, formatMoney(e.amount)),
                          h('p', { className: 'muted' }, e.category + ' · ' + e.expenseDate),
                        ]),
                        h('span', { className: 'req-badge status-' + e.status }, e.status),
                      ]),
                      h('p', { className: 'req-item-desc' }, e.description),
                      e.invoiceUrl && h('a', { href: e.invoiceUrl, target: '_blank', className: 'req-attachment' }, '📎 View Receipt'),
                      e.adminNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Admin Note:'),
                        h('p', null, e.adminNote),
                      ]),
                    ]);
                  })),
            ]),
          ]),

          // ===== MEDICAL REIMBURSEMENT SECTION =====
          reqTab === 'medical' && h('div', { className: 'req-grid' }, [
            h('div', { className: 'card req-form-card' }, [
              h('div', { className: 'req-form-header' }, [
                h('span', { className: 'req-form-icon' }, '🏥'),
                h('div', null, [
                  h('strong', null, 'Medical Reimbursement'),
                  h('p', { className: 'muted' }, 'Submit medical expenses for reimbursement'),
                ]),
              ]),
              h('label', { className: 'field' }, ['Amount (AED)', h('input', { type: 'number', value: medicalForm.amount, onChange: function(e) { medicalForm.amount = e.target.value; setMedicalForm(Object.assign({}, medicalForm)); }, placeholder: 'e.g. 500.00' })]),
              h('label', { className: 'field' }, ['Medical Type', h('select', { value: medicalForm.medicalType, onChange: function(e) { medicalForm.medicalType = e.target.value; setMedicalForm(Object.assign({}, medicalForm)); } }, [
                h('option', { value: 'consultation' }, 'Doctor Consultation'),
                h('option', { value: 'medication' }, 'Medication'),
                h('option', { value: 'surgery' }, 'Surgery'),
                h('option', { value: 'diagnostic' }, 'Diagnostic Tests'),
                h('option', { value: 'dental' }, 'Dental'),
                h('option', { value: 'optical' }, 'Optical'),
                h('option', { value: 'emergency' }, 'Emergency'),
                h('option', { value: 'other' }, 'Other'),
              ])]),
              h('label', { className: 'field' }, ['Hospital/Clinic Name', h('input', { value: medicalForm.hospitalName, onChange: function(e) { medicalForm.hospitalName = e.target.value; setMedicalForm(Object.assign({}, medicalForm)); }, placeholder: 'e.g. Dubai Hospital' })]),
              h('label', { className: 'field' }, ['Date of Expense', h('input', { type: 'date', value: medicalForm.expenseDate, onChange: function(e) { medicalForm.expenseDate = e.target.value; setMedicalForm(Object.assign({}, medicalForm)); } })]),
              h('label', { className: 'field' }, ['Description', h('textarea', { value: medicalForm.description, onChange: function(e) { medicalForm.description = e.target.value; setMedicalForm(Object.assign({}, medicalForm)); }, rows: 4, placeholder: 'Describe the medical expense...' })]),
              h('label', { className: 'field' }, ['Receipt/Invoice', h('input', { type: 'file', onChange: function(e) { setMedicalFile(e.target.files?.[0] || null); }, accept: 'image/*,application/pdf' })]),
              medicalFile && h('p', { className: 'muted', style: { fontSize: '12px' } }, 'File selected: ' + medicalFile.name),
              h('button', { className: 'btn primary', onClick: submitMedicalReimbursement, disabled: reqBusy || !medicalForm.amount || !medicalForm.description || !medicalForm.hospitalName || !medicalForm.expenseDate }, reqBusy ? 'Submitting...' : 'Submit Request'),
            ]),
            h('div', { className: 'card req-list-card' }, [
              h('div', { className: 'req-list-header' }, [
                h('div', null, [
                  h('strong', null, 'My Medical Requests'),
                  h('p', { className: 'muted' }, medicalReimbursements.length + ' total'),
                ]),
                h('button', { className: 'btn white small', onClick: function() { loadReqData('medical'); } }, 'Refresh'),
              ]),
              medicalReimbursements.length === 0
                ? h(EmptyState, { title: 'No medical requests yet', message: 'Submit a medical reimbursement request above to get started.' })
                : h('div', { className: 'req-items' }, medicalReimbursements.map(function(m) {
                    return h('div', { key: m.id, className: 'req-item' }, [
                      h('div', { className: 'req-item-header' }, [
                        h('div', null, [
                          h('strong', null, m.hospitalName),
                          h('p', { className: 'muted' }, m.medicalType.replace('-', ' ') + ' · ' + new Date(m.createdAt).toLocaleDateString()),
                        ]),
                        h('span', { className: 'req-badge status-' + m.status }, m.status),
                        h('span', { className: 'req-badge amount' }, 'AED ' + parseFloat(m.amount).toFixed(2)),
                      ]),
                      h('p', { className: 'req-item-desc' }, m.description),
                      m.managerNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Manager Note:'),
                        h('p', null, m.managerNote),
                      ]),
                      m.adminNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Admin Note:'),
                        h('p', null, m.adminNote),
                      ]),
                    ]);
                  })),
            ]),
          ]),

          // ===== AIR TICKET REIMBURSEMENT SECTION =====
          reqTab === 'air-tickets' && h('div', { className: 'req-grid' }, [
            h('div', { className: 'card req-form-card' }, [
              h('div', { className: 'req-form-header' }, [
                h('span', { className: 'req-form-icon' }, '✈️'),
                h('div', null, [
                  h('strong', null, 'Air Ticket Reimbursement'),
                  h('p', { className: 'muted' }, 'Request reimbursement for flight tickets'),
                ]),
              ]),
              h('label', { className: 'field' }, ['Amount (AED) - Max 500', h('input', { type: 'number', max: 500, value: airTicketForm.amount, onChange: function(e) { 
                const val = Math.min(500, Math.max(0, Number(e.target.value) || 0));
                airTicketForm.amount = String(val);
                setAirTicketForm(Object.assign({}, airTicketForm)); 
              }, placeholder: 'e.g. 500.00' })]),
              h('label', { className: 'field' }, ['Ticket Type', h('select', { value: airTicketForm.ticketType, onChange: function(e) { airTicketForm.ticketType = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); } }, [
                h('option', { value: 'domestic' }, 'Domestic'),
                h('option', { value: 'international' }, 'International'),
              ])]),
              h('label', { className: 'field' }, ['Purpose', h('input', { value: airTicketForm.purpose, onChange: function(e) { airTicketForm.purpose = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); }, placeholder: 'e.g. Business trip to Abu Dhabi' })]),
              h('label', { className: 'field' }, ['Departure City', h('input', { value: airTicketForm.departureCity, onChange: function(e) { airTicketForm.departureCity = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); }, placeholder: 'e.g. Dubai' })]),
              h('label', { className: 'field' }, ['Destination City', h('input', { value: airTicketForm.destinationCity, onChange: function(e) { airTicketForm.destinationCity = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); }, placeholder: 'e.g. London' })]),
              h('label', { className: 'field' }, ['Airline', h('input', { value: airTicketForm.airline, onChange: function(e) { airTicketForm.airline = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); }, placeholder: 'e.g. Emirates' })]),
              h('label', { className: 'field' }, ['Ticket Number', h('input', { value: airTicketForm.ticketNumber, onChange: function(e) { airTicketForm.ticketNumber = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); }, placeholder: 'e.g. EK1234567890' })]),
              h('label', { className: 'field' }, ['Departure Date', h('input', { type: 'date', value: airTicketForm.departureDate, onChange: function(e) { airTicketForm.departureDate = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); } })]),
              h('label', { className: 'field' }, ['Return Date (optional)', h('input', { type: 'date', value: airTicketForm.returnDate, onChange: function(e) { airTicketForm.returnDate = e.target.value; setAirTicketForm(Object.assign({}, airTicketForm)); } })]),
              h('label', { className: 'field' }, ['Invoice/Ticket (PDF or Image)', h('input', { type: 'file', onChange: function(e) { setAirTicketFile(e.target.files?.[0] || null); }, accept: 'image/*,application/pdf' })]),
              airTicketFile && h('p', { className: 'muted', style: { fontSize: '12px' } }, 'File selected: ' + airTicketFile.name),
              h('button', { className: 'btn primary', onClick: submitAirTicket, disabled: reqBusy || !airTicketForm.amount || !airTicketForm.purpose || !airTicketForm.departureCity || !airTicketForm.destinationCity || !airTicketForm.airline || !airTicketForm.ticketNumber || !airTicketForm.departureDate }, reqBusy ? 'Submitting...' : 'Submit Request'),
            ]),
            h('div', { className: 'card req-list-card' }, [
              h('div', { className: 'req-list-header' }, [
                h('div', null, [
                  h('strong', null, 'My Air Tickets'),
                  h('p', { className: 'muted' }, airTickets.length + ' total'),
                ]),
                h('button', { className: 'btn white small', onClick: function() { loadReqData('air-tickets'); } }, 'Refresh'),
              ]),
              airTickets.length === 0
                ? h(EmptyState, { title: 'No air ticket requests yet', message: 'Submit an air ticket reimbursement request above to get started.' })
                : h('div', { className: 'req-items' }, airTickets.map(function(a) {
                    return h('div', { key: a.id, className: 'req-item' }, [
                      h('div', { className: 'req-item-header' }, [
                        h('div', null, [
                          h('strong', null, a.purpose),
                          h('p', { className: 'muted' }, (a.ticketType || '').toUpperCase() + ' · ' + new Date(a.createdAt).toLocaleDateString()),
                        ]),
                        h('span', { className: 'req-badge status-' + a.status }, a.status),
                        h('span', { className: 'req-badge amount' }, 'AED ' + parseFloat(a.amount).toFixed(2)),
                      ]),
                      h('p', { className: 'req-item-desc' }, `${a.departureCity} → ${a.destinationCity} · ${a.airline} · Ticket: ${a.ticketNumber}`),
                      a.managerNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Manager Note:'),
                        h('p', null, a.managerNote),
                      ]),
                      a.adminNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Admin Note:'),
                        h('p', null, a.adminNote),
                      ]),
                    ]);
                  })),
            ]),
          ]),

          // ===== LOANS SECTION =====
          reqTab === 'loans' && h('div', { className: 'req-grid' }, [
            h('div', { className: 'card req-form-card' }, [
              h('div', { className: 'req-form-header' }, [
                h('span', { className: 'req-form-icon' }, '🏦'),
                h('div', null, [
                  h('strong', null, 'Apply for a Loan'),
                  h('p', { className: 'muted' }, 'Maximum 2,000 AED with flexible EMI'),
                ]),
              ]),
              h('div', { className: 'req-loan-calc' }, [
                h('div', null, [
                  h('strong', null, formatMoney(Number(loanForm.amount) || 0)),
                  h('span', null, 'Loan Amount'),
                ]),
                h('div', null, [
                  h('strong', null, loanForm.totalInstallments + 'x'),
                  h('span', null, 'Installments'),
                ]),
                h('div', null, [
                  h('strong', null, formatMoney(loanForm.amount ? (Number(loanForm.amount) / Number(loanForm.totalInstallments)) : 0)),
                  h('span', null, 'Per Installment'),
                ]),
              ]),
              h('label', { className: 'field' }, ['Amount (max 2,000 AED)', h('input', { type: 'range', min: 100, max: 2000, step: 50, value: loanForm.amount || 100, onChange: function(e) { loanForm.amount = e.target.value; setLoanForm(Object.assign({}, loanForm)); } })]),
              h('div', { className: 'req-range-value' }, formatMoney(Number(loanForm.amount) || 0)),
              h('label', { className: 'field' }, ['Number of Installments (1-12)', h('input', { type: 'range', min: 1, max: 12, value: loanForm.totalInstallments, onChange: function(e) { loanForm.totalInstallments = e.target.value; setLoanForm(Object.assign({}, loanForm)); } })]),
              h('div', { className: 'req-range-value' }, loanForm.totalInstallments + ' months'),
              h('label', { className: 'field' }, ['Purpose', h('textarea', { value: loanForm.purpose, onChange: function(e) { loanForm.purpose = e.target.value; setLoanForm(Object.assign({}, loanForm)); }, rows: 3, placeholder: 'Why do you need the loan?' })]),
              h('button', { className: 'btn primary', onClick: submitLoan, disabled: reqBusy || !loanForm.amount || !loanForm.purpose }, reqBusy ? 'Submitting...' : 'Apply for Loan'),
            ]),
            h('div', { className: 'card req-list-card' }, [
              h('div', { className: 'req-list-header' }, [
                h('div', null, [
                  h('strong', null, 'My Loans'),
                  h('p', { className: 'muted' }, loans.length + ' total'),
                ]),
                h('button', { className: 'btn white small', onClick: function() { loadReqData('loans'); } }, 'Refresh'),
              ]),
              loans.length === 0
                ? h(EmptyState, { title: 'No loans yet', message: 'Apply for a loan above.' })
                : h('div', { className: 'req-items' }, loans.map(function(l) {
                    const progress = l.totalInstallments > 0 ? Math.round((l.paidInstallments / l.totalInstallments) * 100) : 0;
                    return h('div', { key: l.id, className: 'req-item loan-item' }, [
                      h('div', { className: 'req-item-header' }, [
                        h('div', null, [
                          h('strong', null, formatMoney(l.amount)),
                          h('p', { className: 'muted' }, l.totalInstallments + ' installments · ' + formatMoney(l.installmentAmount) + '/mo'),
                        ]),
                        h('span', { className: 'req-badge status-' + l.status }, l.status),
                      ]),
                      h('p', { className: 'req-item-desc' }, l.purpose),
                      (l.status === 'active' || l.status === 'completed') && h('div', { className: 'req-loan-progress' }, [
                        h('div', { className: 'req-progress-bar' }, [
                          h('div', { className: 'req-progress-fill', style: { width: progress + '%' } }),
                        ]),
                        h('span', null, l.paidInstallments + ' / ' + l.totalInstallments + ' paid (' + formatMoney(l.remainingAmount) + ' remaining)'),
                      ]),
                      (l.status === 'active' && l.paidInstallments < l.totalInstallments) && h('button', {
                        className: 'btn secondary small',
                        onClick: function() { payInstallment(l.id); },
                        disabled: reqBusy,
                      }, 'Pay Installment (' + formatMoney(l.installmentAmount) + ')'),
                      l.adminNote && h('div', { className: 'req-admin-response' }, [
                        h('strong', null, 'Admin Note:'),
                        h('p', null, l.adminNote),
                      ]),
                    ]);
                  })),
            ]),
          ]),

          // Leave Quick Access
          h('div', { className: 'card req-leave-card' }, [
            h('div', { className: 'req-form-header' }, [
              h('span', { className: 'req-form-icon' }, '📅'),
              h('div', null, [
                h('strong', null, 'Leave Request'),
                h('p', { className: 'muted' }, 'Quick access to leave management'),
              ]),
            ]),
            h('div', { className: 'req-leave-actions' }, [
              h('button', { className: 'btn primary', onClick: function() { setTab('leave'); } }, 'Apply for Leave'),
              h('button', { className: 'btn secondary', onClick: function() { setTab('leave-approvals'); } }, 'View Approvals'),
              h('button', { className: 'btn white', onClick: function() { setTab('leave'); } }, 'Leave History'),
            ]),
            h('p', { className: 'muted', style: { marginTop: '12px' } }, pendingLeaveRequests.length + ' pending · ' + approvedLeaveRequests.length + ' approved · ' + docs.length + ' documents'),
          ]),
        ]),

        tab === 'leave-approvals' && canView('leave-approvals') && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Approval queue'),
                h('h2', null, 'Leave approvals'),
                h('p', { className: 'muted' }, `${pendingLeaveRequests.length} request${pendingLeaveRequests.length === 1 ? '' : 's'} waiting for review`),
              ]),
              h('button', { className: 'btn secondary small', onClick: loadLeaves }, 'Refresh'),
            ]),
            pendingLeaveRequests.length ? pendingLeaveRequests.map((leave) => {
              const canManagerAct = (user.role === 'restaurant-manager' || user.role === 'admin') && leave.status === 'pending_manager';
              const canCompanyAct = (user.role === 'company-manager' || user.role === 'admin') && leave.status === 'pending_company';
              return h('div', { key: leave.id, className: 'approval-card' }, [
                h('div', { className: 'approval-card-main' }, [
                  h('div', null, [
                    h('strong', null, leave.employee ? `${leave.employee.name} (${leave.employee.employeeId})` : `Employee #${leave.employeeId}`),
                    h('p', { className: 'muted' }, `${leave.leaveType} leave | ${leave.startDate} to ${leave.endDate}`),
                    h('p', { className: 'muted' }, leave.reason),
                  ]),
                  h('span', { className: 'badge badge-pending small' }, leave.status.replace('_', ' ')),
                ]),
                h('div', { className: 'approval-summary' }, [
                  h('div', null, [
                    h('p', { className: 'detail-label' }, 'Restaurant manager'),
                    h('p', null, leave.managerApproval.status),
                  ]),
                  h('div', null, [
                    h('p', { className: 'detail-label' }, 'Company manager'),
                    h('p', null, leave.companyApproval.status),
                  ]),
                ]),
                (canManagerAct || canCompanyAct) && h('div', { className: 'approval-actions' }, [
                  h('input', {
                    value: leaveDecisionNotes[leave.id] || '',
                    onChange: (event) => setLeaveDecisionNotes((prev) => ({ ...prev, [leave.id]: event.target.value })),
                    placeholder: 'Approval note',
                  }),
                  h('button', { className: 'btn red small', onClick: () => decideLeave(leave.id, canManagerAct ? 'manager' : 'company', false) }, 'Reject'),
                  h('button', { className: 'btn primary small', onClick: () => decideLeave(leave.id, canManagerAct ? 'manager' : 'company', true) }, 'Approve'),
                ]),
              ]);
            }) : h(EmptyState, {
              title: 'No approvals waiting',
              message: 'Leave requests that need manager or company approval will appear here.',
              actionLabel: 'Go to leave history',
              onAction: () => setTab('leave'),
            }),
          ]),
        ]),

        tab === 'leave' && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'hero-header' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Leave requests'),
                h('h2', null, 'Apply for leave'),
                h('p', { className: 'muted' }, 'Your request will be reviewed by your restaurant manager first, then by the company manager.'),
              ]),
            ]),
            h('div', { className: 'form-grid' }, [
              h('label', { className: 'field' }, [
                'Leave type',
                h('select', {
                  value: leaveForm.leaveType,
                  onChange: (event) => setLeaveForm((prev) => ({ ...prev, leaveType: event.target.value })),
                }, [
                  h('option', { value: 'Annual' }, 'Annual leave'),
                  h('option', { value: 'PH' }, 'PH leave'),
                  h('option', { value: 'Sick' }, 'Sick leave'),
                  h('option', { value: 'Emergency' }, 'Emergency leave'),
                  h('option', { value: 'Other' }, 'Other'),
                ]),
              ]),
              h('label', { className: 'field' }, [
                'Start date',
                h('input', {
                  type: 'date',
                  value: leaveForm.startDate,
                  onChange: (event) => setLeaveForm((prev) => ({ ...prev, startDate: event.target.value })),
                }),
              ]),
              h('label', { className: 'field' }, [
                'End date',
                h('input', {
                  type: 'date',
                  value: leaveForm.endDate,
                  onChange: (event) => setLeaveForm((prev) => ({ ...prev, endDate: event.target.value })),
                }),
              ]),
              h('label', { className: 'field' }, [
                'Reason',
                h('textarea', {
                  rows: 4,
                  value: leaveForm.reason,
                  onChange: (event) => setLeaveForm((prev) => ({ ...prev, reason: event.target.value })),
                  placeholder: 'Provide a short reason for the leave request',
                }),
              ]),
            ]),
            h('div', { className: 'form-actions' }, [
              h('button', { className: 'btn primary', onClick: applyLeave }, 'Submit request'),
            ]),
          ]),

          h('div', { className: 'card' }, [
            h('h2', null, 'Leave request history'),
            leaveRequests.length ? leaveRequests.map((leave) => {
              const isManager = user.role === 'restaurant-manager' || user.role === 'admin';
              const isCompanyManager = user.role === 'company-manager' || user.role === 'admin';
              const canManagerAct = isManager && leave.status === 'pending_manager';
              const canCompanyAct = isCompanyManager && leave.status === 'pending_company';
              return h('div', { key: leave.id, className: 'doc-item leave-request' }, [
                h('div', null, [
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } }, [
                    h('div', null, [
                      h('strong', null, `${leave.leaveType} leave · ${leave.startDate} to ${leave.endDate}`),
                      h('p', { className: 'muted' }, leave.reason),
                    ]),
                    leave.employee && h('p', { className: 'muted' }, `${leave.employee.name} · ${leave.employee.employeeId}`),
                  ]),
                  h('div', { style: { marginTop: '12px' } }, [
                    h('span', { className: `badge ${leave.status === 'approved' ? 'badge-success' : leave.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}` }, leave.status.replace('_', ' ')),
                  ]),
                ]),
                h('div', { className: 'approval-summary' }, [
                  h('div', null, [
                    h('p', { className: 'detail-label' }, 'Restaurant manager'),
                    h('p', null, `${leave.managerApproval.status}${leave.managerApproval.approverName ? ` by ${leave.managerApproval.approverName}` : ''}`),
                    leave.managerApproval.note && h('p', { className: 'muted' }, `Note: ${leave.managerApproval.note}`),
                  ]),
                  h('div', null, [
                    h('p', { className: 'detail-label' }, 'Company manager'),
                    h('p', null, `${leave.companyApproval.status}${leave.companyApproval.approverName ? ` by ${leave.companyApproval.approverName}` : ''}`),
                    leave.companyApproval.note && h('p', { className: 'muted' }, `Note: ${leave.companyApproval.note}`),
                  ]),
                ]),
                (canManagerAct || canCompanyAct) && h('div', { className: 'section' }, [
                  h('label', { className: 'field' }, [
                    'Approver note',
                    h('input', {
                      type: 'text',
                      value: leaveDecisionNotes[leave.id] || '',
                      onChange: (event) => setLeaveDecisionNotes((prev) => ({ ...prev, [leave.id]: event.target.value })),
                      placeholder: 'Add a note for the employee',
                    }),
                  ]),
                  h('div', { className: 'form-actions' }, [
                    h('button', { className: 'btn red', onClick: () => decideLeave(leave.id, canManagerAct ? 'manager' : 'company', false) }, 'Reject'),
                    h('button', { className: 'btn primary', onClick: () => decideLeave(leave.id, canManagerAct ? 'manager' : 'company', true) }, 'Approve'),
                  ]),
                ]),
              ]);
            }) : h('p', { className: 'muted' }, 'No leave requests have been created yet.'),
          ]),
        ]),

        tab === 'payroll' && canView('payroll') && h('div', { className: 'payroll-page' }, [
          // ===== PROFESSIONAL PAYROLL DASHBOARD HEADER =====
          h('div', { className: 'card payroll-dashboard-hero' }, [
            h('div', { className: 'payroll-hero-content' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Payroll Management'),
                h('h2', null, '💰 Payroll Dashboard'),
                h('p', { className: 'muted' }, 'Search employees, run payroll, manage payments, and generate professional payslips.'),
              ]),
            ]),
          ]),

          // ===== EMPLOYEE SEARCH =====
          h('div', { className: 'card payroll-search-card' }, [
            h('div', { className: 'payroll-search-header' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Employee Lookup'),
                h('h3', null, '🔍 Search Employee'),
                h('p', { className: 'muted' }, 'Search by ID, name, email, or designation to view full salary details.'),
              ]),
              h('div', { className: 'payroll-search-controls' }, [
                h('input', {
                  value: payrollSearchQuery,
                  onChange: (e) => {
                    setPayrollSearchQuery(e.target.value);
                  },
                  onKeyDown: async (e) => {
                    if (e.key === 'Enter' && payrollSearchQuery.trim()) {
                      setPayrollSearchBusy(true);
                      setMessage('Searching...');
                      try {
                        const results = await apiRequest(`/api/payroll/search?q=${encodeURIComponent(payrollSearchQuery.trim())}`, token);
                        setPayrollSearchResults(results);
                        if (!results.length) setMessage('No employees found matching your search.');
                        else setMessage(`Found ${results.length} employee(s).`);
                      } catch (err) {
                        setMessage(err.error || 'Search failed');
                      } finally {
                        setPayrollSearchBusy(false);
                      }
                    }
                  },
                  placeholder: 'Type employee ID, name, email...',
                  className: 'payroll-search-input',
                }),
                h('button', {
                  className: 'btn primary',
                  onClick: async () => {
                    if (!payrollSearchQuery.trim()) return;
                    setPayrollSearchBusy(true);
                    setMessage('Searching...');
                    try {
                      const results = await apiRequest(`/api/payroll/search?q=${encodeURIComponent(payrollSearchQuery.trim())}`, token);
                      setPayrollSearchResults(results);
                      if (!results.length) setMessage('No employees found matching your search.');
                      else setMessage(`Found ${results.length} employee(s).`);
                    } catch (err) {
                      setMessage(err.error || 'Search failed');
                    } finally {
                      setPayrollSearchBusy(false);
                    }
                  },
                }, payrollSearchBusy ? '⏳' : '🔍 Search'),
              ]),
            ]),
            // Search results
            payrollSearchResults.length > 0 && h('div', { className: 'payroll-search-results' },
              payrollSearchResults.map((result, idx) => {
                const emp = result.employee;
                const payrollData = result.payroll;
                const summary = payrollData.summary;
                const loans = result.loans;
                const expenses = result.expenses;
                const att = result.attendance;
                return h('div', { key: emp.id || idx, className: 'payroll-employee-card' }, [
                  // Employee header
                  h('div', { className: 'payroll-emp-header' }, [
                    emp.photoUrl
                      ? h('img', { src: emp.photoUrl, className: 'employee-avatar large', alt: emp.name })
                      : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(emp.name)),
                    h('div', { className: 'payroll-emp-info' }, [
                      h('div', { className: 'employee-name-line' }, [
                        h('strong', null, emp.name || 'Unnamed'),
                        h('span', { className: 'employee-id-pill' }, emp.employeeId || ''),
                        h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                      ]),
                      h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'} | Base: ${formatMoney(emp.salary)}`),
                    ]),
                    h('div', { className: 'payroll-emp-actions' }, [
                      h('button', {
                        className: 'btn primary small',
                        onClick: async () => {
                          setPayrollRequest({ employeeId: emp.employeeId, month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
                          setSelectedEmployeeDetails(emp);
                          await loadPayrollForEmployee(emp.employeeId);
                        },
                      }, '📋 View Payslips'),
                    ]),
                  ]),

                  // Stats Grid - Full financial overview
                  h('div', { className: 'payroll-emp-stats-grid' }, [
                    h('div', { className: 'payroll-stat-card salary' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Total Paid'),
                      h('strong', { className: 'payroll-stat-value positive' }, formatMoney(summary.totalPaid)),
                    ]),
                    h('div', { className: 'payroll-stat-card pending' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Total Pending'),
                      h('strong', { className: 'payroll-stat-value warning' }, formatMoney(summary.totalPending)),
                    ]),
                    h('div', { className: 'payroll-stat-card loan' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Active Loans'),
                      h('strong', { className: 'payroll-stat-value' }, `${loans.active} (${formatMoney(loans.totalRemaining)})`),
                    ]),
                    h('div', { className: 'payroll-stat-card expense' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Pending Expenses'),
                      h('strong', { className: 'payroll-stat-value' }, `${expenses.pending} (${formatMoney(expenses.totalPending)})`),
                    ]),
                    h('div', { className: 'payroll-stat-card attendance' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Attendance Rate'),
                      h('strong', { className: 'payroll-stat-value' }, `${att.attendanceRate || 0}%`),
                    ]),
                    h('div', { className: 'payroll-stat-card records' }, [
                      h('span', { className: 'payroll-stat-label' }, 'Payroll Records'),
                      h('strong', { className: 'payroll-stat-value' }, summary.totalRecords),
                    ]),
                  ]),

                  // Recent payslips
                  payrollData.records && payrollData.records.length > 0 && h('div', { className: 'payroll-emp-recent' }, [
                    h('h4', null, 'Recent Payslips'),
                    h('div', { className: 'payroll-recent-list' },
                      payrollData.records.slice(0, 6).map(p => {
                        const mn = new Date(p.year, p.month - 1, 1).toLocaleString('default', { month: 'short' });
                        return h('div', { key: p.id, className: 'payroll-recent-item' }, [
                          h('span', { className: 'payroll-recent-month' }, `${mn} ${p.year}`),
                          h('span', { className: 'payroll-recent-amount' }, formatMoney(p.net)),
                          h('span', { className: `payroll-recent-status ${p.paymentStatus}` }, p.paymentStatus === 'paid' ? '✅ Paid' : p.paymentStatus === 'processing' ? '⏳ Processing' : '⏸️ Pending'),
                          h('button', {
                            className: 'btn white small',
                            onClick: () => downloadPayslipPdf(p.id),
                            title: 'Download PDF',
                          }, '📄'),
                        ]);
                      })
                    ),
                  ]),
                ]);
              })
            ),
            // No results state
            payrollSearchQuery && payrollSearchResults.length === 0 && h('div', { className: 'payroll-empty-state' }, [
              h('span', { className: 'payroll-empty-icon' }, '🔍'),
              h('p', null, 'No employees found. Try a different search term.'),
            ]),
          ]),

          // ===== PAYROLL SUMMARY (with month picker) =====
          h('div', { className: 'card payroll-summary-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Monthly Overview'),
                h('h3', null, '📊 Payroll Summary'),
              ]),
              h('div', { className: 'payroll-summary-controls' }, [
                h('label', { className: 'field compact-field' }, [
                  'Month',
                  h('select', {
                    value: reportMonth,
                    onChange: (e) => setReportMonth(Number(e.target.value)),
                  }, MONTH_NAMES.map((mn, i) => h('option', { key: i, value: i + 1 }, mn))),
                ]),
                h('label', { className: 'field compact-field year-field' }, [
                  'Year',
                  h('input', {
                    type: 'number',
                    value: reportYear,
                    onChange: (e) => setReportYear(parseInt(e.target.value) || new Date().getFullYear()),
                  }),
                ]),
                h('button', {
                  className: 'btn primary small',
                  onClick: async () => {
                    try {
                      const data = await apiRequest(`/api/payroll/summary?month=${reportMonth}&year=${reportYear}`, token);
                      setReportsData(data);
                      setMessage('Payroll summary loaded');
                    } catch (err) {
                      setMessage(err.error || 'Failed to load summary');
                    }
                  },
                }, '📊 Load Summary'),
              ]),
            ]),
            reportsData && reportsData.totalEmployees > 0 && h('div', { className: 'payroll-summary-stats' }, [
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Employees'),
                h('strong', { className: 'kpi-value' }, reportsData.totalEmployees),
              ]),
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Total Gross'),
                h('strong', { className: 'kpi-value' }, formatMoney(reportsData.totalGross)),
              ]),
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Total Deductions'),
                h('strong', { className: 'kpi-value negative' }, formatMoney(reportsData.totalDeductions)),
              ]),
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Total Net'),
                h('strong', { className: 'kpi-value accent' }, formatMoney(reportsData.totalNet)),
              ]),
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Paid'),
                h('strong', { className: 'kpi-value positive' }, `${reportsData.paidCount}`),
              ]),
              h('div', { className: 'payroll-kpi' }, [
                h('span', { className: 'kpi-label' }, 'Pending'),
                h('strong', { className: 'kpi-value warning' }, `${reportsData.pendingCount}`),
              ]),
            ]),
            reportsData && reportsData.totalEmployees === 0 && h('div', { className: 'payroll-empty-state' }, [
              h('p', null, 'No payroll records for this month. Run payroll for employees first.'),
            ]),
          ]),

          // ===== RUN PAYROLL SECTION =====
          h('div', { className: 'card payroll-run-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Generate Payroll'),
                h('h3', null, '⚙️ Run Payroll'),
                h('p', { className: 'muted' }, 'Select an employee, month, and year to generate/update their payslip.'),
              ]),
            ]),
            h('div', { className: 'form-grid' }, [
              h('label', { className: 'field' }, [
                'Employee',
                h('select', {
                  value: payrollRequest.employeeId,
                  onChange: (e) => setPayrollRequest(prev => ({ ...prev, employeeId: e.target.value })),
                }, [
                  h('option', { value: '' }, 'Select employee...'),
                  employees.map(emp => h('option', { key: emp.employeeId, value: emp.employeeId }, `${emp.name} (${emp.employeeId})`)),
                ]),
              ]),
              h('label', { className: 'field' }, [
                'Month',
                h('select', {
                  value: payrollRequest.month,
                  onChange: (e) => setPayrollRequest(prev => ({ ...prev, month: e.target.value })),
                }, MONTH_NAMES.map((mn, i) => h('option', { key: i, value: String(i + 1) }, mn))),
              ]),
              h('label', { className: 'field' }, [
                'Year',
                h('input', {
                  type: 'number',
                  value: payrollRequest.year,
                  onChange: (e) => setPayrollRequest(prev => ({ ...prev, year: e.target.value })),
                }),
              ]),
              h('label', { className: 'field' }, [
                'Notes (optional)',
                h('input', {
                  value: payrollNotes,
                  onChange: (e) => setPayrollNotes(e.target.value),
                  placeholder: 'Payroll notes...',
                }),
              ]),
            ]),
            h('div', { className: 'form-actions' }, [
              h('button', {
                className: 'btn primary',
                onClick: runPayroll,
                disabled: !payrollRequest.employeeId || !payrollRequest.month || !payrollRequest.year,
              }, '⚡ Run Payroll'),
              h('button', {
                className: 'btn secondary',
                onClick: () => {
                  if (payrollRequest.employeeId) loadPayrollForEmployee(payrollRequest.employeeId);
                },
                disabled: !payrollRequest.employeeId,
              }, '📋 View Payslips'),
            ]),
          ]),

          // ===== EMPLOYEE PAYSLIPS LIST (when selected from search) =====
          selectedEmployeeDetails && payrollRequest.employeeId && teamPayslips.length > 0 && h('div', { className: 'card payroll-payslips-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Employee Payslips'),
                h('h3', null, `📋 ${selectedEmployeeDetails.name || selectedEmployeeDetails.employeeId} - Payslip History`),
                h('p', { className: 'muted' }, `${teamPayslips.length} records · Total Paid: ${formatMoney(teamPayslips.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + Number(r.net || 0), 0))}`),
              ]),
              h('button', {
                className: 'btn white small',
                onClick: () => {
                  setSelectedEmployeeDetails(null);
                  setPayrollRequest(prev => ({ ...prev, employeeId: '' }));
                  setTeamPayslips([]);
                },
              }, '✕ Clear'),
            ]),
            h('div', { className: 'payroll-payslips-list' },
              teamPayslips.map(p => {
                const mn = new Date(p.year, p.month - 1, 1).toLocaleString('default', { month: 'long' });
                return h('div', { key: p.id, className: 'payroll-payslip-row' }, [
                  h('div', { className: 'payroll-payslip-main' }, [
                    h('div', { className: 'payroll-payslip-period' }, [
                      h('strong', null, `${mn} ${p.year}`),
                      h('span', { className: `payroll-recent-status ${p.paymentStatus}` }, p.paymentStatus.toUpperCase()),
                    ]),
                    h('div', { className: 'payroll-payslip-amounts' }, [
                      h('span', null, `Gross: ${formatMoney(p.gross)}`),
                      h('span', null, `Deductions: ${formatMoney(p.totalDeductions)}`),
                      h('span', { style: { fontWeight: 700, color: 'var(--accent)' } }, `Net: ${formatMoney(p.net)}`),
                    ]),
                    p.paymentMethod && h('span', { className: 'muted' }, `Payment: ${p.paymentMethod}${p.paidAt ? ' · ' + new Date(p.paidAt).toLocaleDateString() : ''}`),
                  ]),
                  h('div', { className: 'payroll-payslip-actions' }, [
                    h('button', {
                      className: 'btn primary small',
                      onClick: () => downloadPayslipPdf(p.id),
                    }, '📄 PDF'),
                    p.paymentStatus === 'pending' && h('button', {
                      className: 'btn secondary small',
                      onClick: async () => {
                        try {
                          await apiRequest(`/api/payroll/${p.id}/pay`, token, { method: 'POST', body: JSON.stringify({ paymentMethod: 'bank_transfer' }) });
                          setMessage('✅ Payslip marked as paid!');
                          await loadPayrollForEmployee(payrollRequest.employeeId);
                        } catch (err) {
                          setMessage(err.error || 'Failed to mark payment');
                        }
                      },
                    }, '💰 Mark Paid'),
                  ]),
                ]);
              })
            ),
          ]),

          // ===== BULK PAY ACTIONS =====
          h('div', { className: 'card payroll-bulk-card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Bulk Actions'),
                h('h3', null, '📦 Bulk Payment Processing'),
                h('p', { className: 'muted' }, 'Mark all pending payslips for the selected month as paid in bulk.'),
              ]),
            ]),
            h('div', { className: 'form-grid' }, [
              h('label', { className: 'field' }, [
                'Month',
                h('select', {
                  value: reportMonth,
                  onChange: (e) => setReportMonth(Number(e.target.value)),
                }, MONTH_NAMES.map((mn, i) => h('option', { key: i, value: i + 1 }, mn))),
              ]),
              h('label', { className: 'field' }, [
                'Year',
                h('input', { type: 'number', value: reportYear, onChange: (e) => setReportYear(parseInt(e.target.value) || new Date().getFullYear()) }),
              ]),
            ]),
            h('div', { className: 'form-actions' }, [
              h('button', {
                className: 'btn primary',
                onClick: async () => {
                  try {
                    const data = await apiRequest(`/api/payroll?month=${reportMonth}&year=${reportYear}&status=pending`, token);
                    if (!data.length) return setMessage('No pending payslips found for this month.');
                    const ids = data.map(p => p.id);
                    const result = await apiRequest('/api/payroll/bulk-pay', token, {
                      method: 'POST',
                      body: JSON.stringify({ ids, paymentMethod: 'bank_transfer' }),
                    });
                    setMessage(`✅ ${result.count} payslips marked as paid!`);
                  } catch (err) {
                    setMessage(err.error || 'Bulk pay failed');
                  }
                },
              }, '💰 Pay All Pending'),
              h('button', {
                className: 'btn secondary',
                onClick: async () => {
                  try {
                    const data = await apiRequest(`/api/payroll?month=${reportMonth}&year=${reportYear}`, token);
                    const blob = new Blob([JSON.stringify(data.map(p => ({
                      employeeId: p.Employee?.employeeId,
                      name: p.Employee?.name,
                      gross: p.gross,
                      deductions: p.totalDeductions,
                      net: p.net,
                      status: p.paymentStatus,
                      month: p.month,
                      year: p.year,
                    })), null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `payroll_${reportMonth}_${reportYear}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setMessage('📥 Payroll data exported');
                  } catch (err) {
                    setMessage(err.error || 'Export failed');
                  }
                },
              }, '📥 Export Data'),
            ]),
          ]),
        ]),

        tab === 'payslips' && canView('payslips') && h('div', { className: 'payslip-page' }, [
          // ===== PROFESSIONAL PAYSLIPS VIEW FOR EMPLOYEES =====
          h('div', { className: 'card payslip-hero' }, [
            h('div', { className: 'payslip-hero-content' }, [
              h('div', { className: 'payslip-hero-left' }, [
                h('p', { className: 'eyebrow' }, 'Payslips'),
                h('h2', null, '📄 My Payslips'),
                h('p', { className: 'muted' }, `${payslips.length} payslip${payslips.length === 1 ? '' : 's'} available. Download professional PDF statements.`),
              ]),
              h('div', { className: 'payslip-hero-right' }, [
                h('div', { className: 'payslip-summary-card' }, [
                  h('span', { className: 'payslip-summary-label' }, 'Total Earnings'),
                  h('span', { className: 'payslip-summary-value' }, formatMoney(payslips.reduce((s, p) => s + Number(p.gross || 0), 0))),
                ]),
                h('div', { className: 'payslip-summary-card' }, [
                  h('span', { className: 'payslip-summary-label' }, 'Net Received'),
                  h('span', { className: 'payslip-summary-value accent' }, formatMoney(payslips.reduce((s, p) => s + Number(p.net || 0), 0))),
                ]),
              ]),
            ]),
          ]),

          // ===== PAYSLIP CARDS WITH FULL DETAILS =====
          payslips.length ? h('div', { className: 'payslip-grid' },
            payslips.map((p) => {
              const monthName = new Date(p.year, p.month - 1, 1).toLocaleString('default', { month: 'long' });
              const details = p.details || {};
              const salaryBrk = details.salaryBreakdown || {};
              const deductions = details.deductions || {};
              return h('div', { key: p.id, className: 'payslip-card' }, [
                h('div', { className: 'payslip-card-header' }, [
                  h('div', { className: 'payslip-month-badge' }, [
                    h('span', { className: 'payslip-month-name' }, monthName),
                    h('span', { className: 'payslip-month-year' }, String(p.year)),
                  ]),
                  h('div', { className: 'payslip-status' }, [
                    h('span', { className: `payslip-status-badge ${p.paymentStatus}` }, p.paymentStatus === 'paid' ? '✅ Paid' : p.paymentStatus === 'processing' ? '⏳ Processing' : '⏸️ Pending'),
                  ]),
                ]),

                h('div', { className: 'payslip-card-body' }, [
                  // Net salary hero
                  h('div', { className: 'payslip-net-section' }, [
                    h('span', { className: 'payslip-net-label' }, 'Net Salary'),
                    h('span', { className: 'payslip-net-amount' }, formatMoney(p.net)),
                  ]),

                  // Salary breakdown grid
                  h('div', { className: 'payslip-details-grid' }, [
                    h('div', { className: 'payslip-detail-item' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Basic Salary'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.basicSalary || salaryBrk.basicSalary)),
                    ]),
                    h('div', { className: 'payslip-detail-item' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Housing Allowance'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.housingAllowance || salaryBrk.housingAllowance)),
                    ]),
                    h('div', { className: 'payslip-detail-item' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Transport Allowance'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.transportAllowance || salaryBrk.transportAllowance)),
                    ]),
                    h('div', { className: 'payslip-detail-item' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Food Allowance'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.foodAllowance || salaryBrk.foodAllowance)),
                    ]),
                    h('div', { className: 'payslip-detail-item' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Other Allowances'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.otherAllowances || salaryBrk.otherAllowances)),
                    ]),
                    h('div', { className: 'payslip-detail-item highlight' }, [
                      h('span', { className: 'payslip-detail-label' }, 'Gross Salary'),
                      h('span', { className: 'payslip-detail-value' }, formatMoney(p.gross)),
                    ]),
                  ]),

                  // Deductions section
                  h('div', { className: 'payslip-deductions-section' }, [
                    h('strong', { className: 'payslip-deductions-title' }, 'Deductions'),
                    h('div', { className: 'payslip-details-grid' }, [
                      h('div', { className: 'payslip-detail-item deduction' }, [
                        h('span', { className: 'payslip-detail-label' }, 'Absent Deduction'),
                        h('span', { className: 'payslip-detail-value negative' }, `-${formatMoney(p.absentDeduction || deductions.absentDeduction || 0)}`),
                      ]),
                      h('div', { className: 'payslip-detail-item deduction' }, [
                        h('span', { className: 'payslip-detail-label' }, 'Loan Deduction'),
                        h('span', { className: 'payslip-detail-value negative' }, `-${formatMoney(p.loanDeduction || deductions.loanDeduction || 0)}`),
                      ]),
                      h('div', { className: 'payslip-detail-item deduction' }, [
                        h('span', { className: 'payslip-detail-label' }, 'Insurance'),
                        h('span', { className: 'payslip-detail-value negative' }, `-${formatMoney(p.insuranceDeduction || deductions.insuranceDeduction || 0)}`),
                      ]),
                      h('div', { className: 'payslip-detail-item deduction' }, [
                        h('span', { className: 'payslip-detail-label' }, 'Tax / Other'),
                        h('span', { className: 'payslip-detail-value negative' }, `-${formatMoney(p.taxDeduction + p.otherDeductions || deductions.taxDeduction + deductions.otherDeductions || 0)}`),
                      ]),
                      h('div', { className: 'payslip-detail-item deduction total' }, [
                        h('span', { className: 'payslip-detail-label' }, 'Total Deductions'),
                        h('span', { className: 'payslip-detail-value negative' }, `-${formatMoney(p.totalDeductions)}`),
                      ]),
                    ]),
                  ]),
                ]),

                // Footer with attendance + download
                h('div', { className: 'payslip-card-footer' }, [
                  h('div', { className: 'payslip-meta' }, [
                    details.daysInMonth && h('span', null, `📅 ${details.presentDays || 0}/${details.daysInMonth} days present`),
                    h('span', null, `Generated: ${details.generatedAt ? new Date(details.generatedAt).toLocaleDateString() : '—'}`),
                    p.paidAt && h('span', null, `Paid: ${new Date(p.paidAt).toLocaleDateString()}`),
                  ]),
                  h('button', {
                    className: 'btn primary small',
                    onClick: () => downloadPayslipPdf(p.id),
                  }, '📄 Download PDF'),
                ]),
              ]);
            })
          ) : h('div', { className: 'card' }, [
            h('div', { className: 'payslip-empty' }, [
              h('span', { className: 'payslip-empty-icon' }, '📄'),
              h('h3', null, 'No payslips yet'),
              h('p', { className: 'muted' }, 'Payslips are generated after payroll processing. Contact your manager if you believe this is an error.'),
            ]),
          ]),
        ]),

        // ===== EMPLOYEES DIRECTORY =====
        tab === 'employees' && canView('employees-section') && h('div', { className: 'grid', style: { maxWidth: '1200px' } }, [
          h('div', { className: 'card', style: { marginBottom: '16px' } }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Employee Management'),
                h('h2', null, '👥 Employee Directory'),
                h('p', { className: 'muted' }, `${employees.length} total employees - Search, view profiles, fines, documents and more`),
              ]),
              h('div', { className: 'directory-controls' }, [
                h('input', {
                  value: companySearch,
                  onChange: (e) => setCompanySearch(e.target.value),
                  placeholder: 'Search by ID, name, email...',
                  style: { padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--input-border)' },
                }),
                h('button', { className: 'btn primary small', onClick: async () => {
                  setMessage('Loading org chart...');
                  try {
                    const data = await apiRequest('/api/employees-management/org-chart', token);
                    setCompanyData(prev => ({ ...prev, orgChart: data }));
                    setMessage(`✅ ${data.totalEmployees} employees loaded`);
                  } catch (err) { setMessage(err.error || 'Failed to load'); }
                } }, '🔄 Load Data'),
                h('button', { className: 'btn secondary small', onClick: () => setTab('org-chart') }, '📊 View Org Chart'),
              ]),
            ]),
          ]),
          h('div', { className: 'company-employee-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' } },
            employees.filter(e => {
              const s = companySearch.toLowerCase();
              return !s || [e.employeeId, e.name, e.email, e.designation, e.role, e.department].filter(Boolean).join(' ').toLowerCase().includes(s);
            }).map(emp => h('div', { key: emp.id, className: 'card', style: { padding: '16px', cursor: 'pointer', border: '1px solid var(--border)' } }, [
              h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, [
                emp.photoUrl
                  ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name })
                  : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                h('div', { style: { flex: 1 } }, [
                  h('strong', { style: { fontSize: '15px' } }, emp.name || 'Unnamed'),
                  h('p', { className: 'muted', style: { fontSize: '12px', margin: '2px 0' } }, `${emp.employeeId} · ${formatRole(emp.role)}`),
                  h('p', { className: 'muted', style: { fontSize: '12px' } }, emp.designation || '—'),
                  emp.department && h('span', { className: 'badge badge-pending small' }, emp.department),
                  h('div', { style: { marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
                    h('span', { className: 'badge small' }, `${(emp.documents || []).length} docs`),
                    h('span', { className: 'badge small' }, `${(emp.assets || []).length} assets`),
                    emp.shiftRoster?.shiftName && h('span', { className: 'badge badge-success small' }, emp.shiftRoster.shiftName),
                  ]),
                ]),
              ]),
              h('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end' } }, [
                h('button', { className: 'btn primary small', onClick: () => { setSelectedEmployeeId(emp.employeeId); setAdminPage('team'); setTab('admin'); } }, 'Profile'),
                h('button', { className: 'btn secondary small', onClick: async () => {
                  try {
                    const data = await apiRequest(`/api/employees-management/${emp.employeeId}/full-profile`, token);
                    setCompanyData(prev => ({ ...prev, selectedFullProfile: data }));
                  } catch (err) { setMessage(err.error || 'Failed to load'); }
                } }, 'Full View'),
              ]),
            ]))
          ),
          // Full profile detail view
          companyData?.selectedFullProfile && h('div', { className: 'card', style: { marginTop: '16px' } }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Full Profile'),
                h('h2', null, `📋 ${companyData.selectedFullProfile.employee.name} (${companyData.selectedFullProfile.employee.employeeId})`),
              ]),
              h('button', { className: 'btn white small', onClick: () => setCompanyData(prev => ({ ...prev, selectedFullProfile: null })) }, '✕ Close'),
            ]),
            h('div', { style: { padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } }, [
              // Personal Info
              h('div', { className: 'card', style: { padding: '12px', background: 'var(--accent-soft)' } }, [
                h('strong', null, '👤 Personal Details'),
                h('div', { style: { marginTop: '8px', fontSize: '13px' } }, [
                  h('p', null, `Employee ID: ${companyData.selectedFullProfile.employee.employeeId}`),
                  h('p', null, `Name: ${companyData.selectedFullProfile.employee.name}`),
                  h('p', null, `Email: ${companyData.selectedFullProfile.employee.email || '—'}`),
                  h('p', null, `Phone: ${companyData.selectedFullProfile.employee.phone || '—'}`),
                  h('p', null, `Department: ${companyData.selectedFullProfile.employee.department || '—'}`),
                  h('p', null, `Designation: ${companyData.selectedFullProfile.employee.designation || '—'}`),
                  h('p', null, `Nationality: ${companyData.selectedFullProfile.employee.nationality || '—'}`),
                  h('p', null, `Role: ${formatRole(companyData.selectedFullProfile.employee.role)}`),
                  h('p', null, `Salary: ${formatMoney(companyData.selectedFullProfile.employee.salary)}`),
                ]),
              ]),
              // Fines section
              h('div', { className: 'card', style: { padding: '12px' } }, [
                h('strong', null, '💰 Fines & Deductions'),
                h('div', { style: { marginTop: '8px', fontSize: '13px' } }, [
                  h('p', null, `Total Fines: ${formatMoney(companyData.selectedFullProfile.fines.totalFines)}`),
                  h('p', { style: { color: '#c62828' } }, `Unpaid: ${formatMoney(companyData.selectedFullProfile.fines.totalUnpaid)} (${companyData.selectedFullProfile.fines.unpaidCount} items)`),
                  h('div', { style: { marginTop: '8px', maxHeight: '150px', overflowY: 'auto' } },
                    (companyData.selectedFullProfile.fines.items || []).slice(0, 10).map((f, i) => h('div', { key: i, style: { padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' } }, [
                      h('span', null, `${f.reason} (${f.date})`),
                      h('span', { style: { fontWeight: 600, color: f.status === 'unpaid' ? '#c62828' : '#2e7d32' } }, `${f.status === 'unpaid' ? '−' : ''}${formatMoney(f.amount)}`),
                    ]))
                  ),
                ]),
              ]),
              // Emergency Contact & Bank
              h('div', { className: 'card', style: { padding: '12px', background: 'var(--accent-soft)' } }, [
                h('strong', null, '📞 Emergency Contact & Bank Details'),
                h('div', { style: { marginTop: '8px', fontSize: '13px' } }, [
                  h('p', { style: { fontWeight: 600 } }, 'Emergency Contact:'),
                  h('p', null, `Name: ${companyData.selectedFullProfile.emergencyContact.name || '—'}`),
                  h('p', null, `Phone: ${companyData.selectedFullProfile.emergencyContact.phone || '—'}`),
                  h('p', null, `Relation: ${companyData.selectedFullProfile.emergencyContact.relation || '—'}`),
                  h('p', { style: { fontWeight: 600, marginTop: '8px' } }, 'Bank Details:'),
                  h('p', null, `Bank: ${companyData.selectedFullProfile.bankDetails.bankName || '—'}`),
                  h('p', null, `Account: ${companyData.selectedFullProfile.bankDetails.accountNumber || '—'}`),
                  h('p', null, `IBAN: ${companyData.selectedFullProfile.bankDetails.iban || '—'}`),
                ]),
              ]),
              // Visa & Contract
              h('div', { className: 'card', style: { padding: '12px' } }, [
                h('strong', null, '🛂 Visa & Contract Info'),
                h('div', { style: { marginTop: '8px', fontSize: '13px' } }, [
                  h('p', { style: { fontWeight: 600 } }, 'Visa:'),
                  h('p', null, `Passport: ${companyData.selectedFullProfile.visaInfo.passportNo || '—'}`),
                  h('p', null, `Passport Expiry: ${companyData.selectedFullProfile.visaInfo.passportExpiry || '—'}`),
                  h('p', null, `Visa Expiry: ${companyData.selectedFullProfile.visaInfo.visaExpiry || '—'}`),
                  h('p', null, `Emirates ID: ${companyData.selectedFullProfile.visaInfo.emiratesId || '—'}`),
                  h('p', { style: { fontWeight: 600, marginTop: '8px' } }, 'Contract:'),
                  h('p', null, `Type: ${companyData.selectedFullProfile.contractInfo.contractType || '—'}`),
                  h('p', null, `Probation End: ${companyData.selectedFullProfile.contractInfo.probationEnd || '—'}`),
                  h('p', null, `Contract End: ${companyData.selectedFullProfile.contractInfo.contractEnd || '—'}`),
                ]),
              ]),
              // Documents
              h('div', { className: 'card', style: { padding: '12px', gridColumn: 'span 2' } }, [
                h('strong', null, '📄 Documents'),
                h('div', { style: { marginTop: '8px', maxHeight: '120px', overflowY: 'auto' } },
                  (companyData.selectedFullProfile.documents || []).length > 0
                    ? companyData.selectedFullProfile.documents.map((d, i) => h('div', { key: i, className: 'doc-item' }, [
                        h('a', { href: d.url, target: '_blank' }, d.originalname || 'Document'),
                        h('span', { className: 'muted' }, d.docType || ''),
                      ]))
                    : h('p', { className: 'muted' }, 'No documents')
                ),
              ]),
              // Assets
              h('div', { className: 'card', style: { padding: '12px', gridColumn: 'span 2' } }, [
                h('strong', null, '📦 Assigned Assets'),
                h('div', { style: { marginTop: '8px' } },
                  (companyData.selectedFullProfile.assets || []).length > 0
                    ? companyData.selectedFullProfile.assets.map((a, i) => h('div', { key: i, className: 'doc-item' }, [
                        h('div', null, [
                          h('strong', null, a.name),
                          h('p', { className: 'muted' }, `SN: ${a.serialNumber || '—'} | ${a.assetType || '—'}`),
                        ]),
                        h('span', { className: 'badge badge-success small' }, a.status || 'assigned'),
                      ]))
                    : h('p', { className: 'muted' }, 'No assets assigned')
                ),
              ]),
            ]),
          ]),
        ]),

        // ===== EMPLOYEE LEAVE BALANCES (self-service view) =====
        tab === 'emp-leave-balances' && canView('employees-section') && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'My Leave Balances'),
                h('h2', null, '📅 Leave Entitlements & Balances'),
                h('p', { className: 'muted' }, 'View your current leave entitlements, approved leaves, pending requests, and remaining balances for all leave types.'),
              ]),
              h('button', { className: 'btn primary small', onClick: async () => {
                if (!token || !user) return setMessage('Login required');
                setEmpLeaveBusy(true);
                try {
                  const data = await apiRequest(`/api/leaves/employee/${user.employeeId}`, token);
                  setEmpLeaveData(data);
                  setMessage('✅ Leave balances loaded');
                } catch (err) { setMessage(err.error || 'Failed to load'); }
                finally { setEmpLeaveBusy(false); }
              } }, '🔄 Load My Balances'),
            ]),
          ]),
          empLeaveBusy && h('p', { className: 'muted', style: { textAlign: 'center', padding: '20px' } }, 'Loading your leave balances...'),
          empLeaveData && empLeaveData.employee && h('div', { className: 'employee-leave-detail' }, [
            h('div', { className: 'card emp-leave-header' }, [
              h('div', { className: 'employee-info' }, [
                empLeaveData.employee.photoUrl
                  ? h('img', { src: empLeaveData.employee.photoUrl, className: 'employee-avatar large', alt: empLeaveData.employee.name })
                  : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(empLeaveData.employee.name)),
                h('div', { className: 'employee-meta' }, [
                  h('div', { className: 'employee-name-line' }, [
                    h('strong', null, empLeaveData.employee.name),
                    h('span', { className: 'employee-id-pill' }, empLeaveData.employee.employeeId),
                    h('span', { className: `employee-role-pill role-${empLeaveData.employee.role}` }, formatRole(empLeaveData.employee.role)),
                  ]),
                  h('p', { className: 'employee-summary' }, `${empLeaveData.employee.email || 'No email'} | ${empLeaveData.employee.designation || 'No designation'}`),
                ]),
              ]),
            ]),
            h('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' } },
              Object.keys(empLeaveData.leaveTypes || {}).map(key => {
                const lt = empLeaveData.leaveTypes[key];
                const balancePct = lt.entitlement > 0 ? Math.round((lt.balance / lt.entitlement) * 100) : 0;
                const barColor = balancePct > 50 ? '#4caf50' : balancePct > 20 ? '#ff9800' : '#f44336';
                return h('div', { key: key, className: 'card emp-leave-type-card', style: { border: '1px solid var(--border)' } }, [
                  h('div', { className: 'emp-leave-type-header' }, [
                    h('strong', { style: { fontSize: '16px' } }, lt.type + ' Leave'),
                    h('span', {
                      className: 'badge ' + (lt.balance > 0 ? (balancePct > 30 ? 'badge-success' : 'badge-pending') : 'badge-rejected'),
                      style: { fontSize: '14px', padding: '6px 14px' },
                    }, `${lt.balance} day${lt.balance !== 1 ? 's' : ''} remaining`),
                  ]),
                  h('div', { className: 'profile-score-bar', style: { margin: '12px 0', height: '12px', borderRadius: '6px' } }, [
                    h('div', {
                      className: 'profile-score-fill',
                      style: { width: balancePct + '%', background: barColor, borderRadius: '6px', height: '12px' },
                    }),
                  ]),
                  h('div', { className: 'emp-leave-type-details', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' } }, [
                    h('div', { style: { textAlign: 'center', padding: '8px', background: 'var(--accent-soft)', borderRadius: '8px' } }, [
                      h('p', { className: 'detail-label', style: { fontSize: '11px' } }, 'Entitlement'),
                      h('strong', { style: { fontSize: '20px', color: '#1976d2' } }, lt.entitlement),
                      h('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'days'),
                    ]),
                    h('div', { style: { textAlign: 'center', padding: '8px', background: lt.approved > 0 ? '#e8f5e9' : 'var(--accent-soft)', borderRadius: '8px' } }, [
                      h('p', { className: 'detail-label', style: { fontSize: '11px' } }, 'Approved'),
                      h('strong', { style: { fontSize: '20px', color: lt.approved > 0 ? '#2e7d32' : '#666' } }, lt.approved),
                      h('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'days'),
                    ]),
                    h('div', { style: { textAlign: 'center', padding: '8px', background: lt.pending > 0 ? '#fff3e0' : 'var(--accent-soft)', borderRadius: '8px' } }, [
                      h('p', { className: 'detail-label', style: { fontSize: '11px' } }, 'Pending'),
                      h('strong', { style: { fontSize: '20px', color: lt.pending > 0 ? '#e65100' : '#666' } }, lt.pending),
                      h('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'days'),
                    ]),
                    h('div', { style: { textAlign: 'center', padding: '8px', background: '#e3f2fd', borderRadius: '8px' } }, [
                      h('p', { className: 'detail-label', style: { fontSize: '11px' } }, 'Balance'),
                      h('strong', { style: { fontSize: '20px', color: lt.balance > 0 ? '#1565c0' : '#c62828' } }, lt.balance),
                      h('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'days'),
                    ]),
                  ]),
                  lt.leaves && lt.leaves.length > 0 && h('div', { className: 'emp-leave-history', style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                    h('strong', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'Leave History'),
                    lt.leaves.slice(0, 10).map(l => h('div', { key: l.id, className: 'doc-item', style: { padding: '6px 8px', marginTop: '4px', fontSize: '13px' } }, [
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', width: '100%' } }, [
                        h('span', { style: { fontWeight: 500 } }, `${l.startDate} to ${l.endDate}`),
                        h('span', { className: `badge ${l.status === 'approved' ? 'badge-success' : l.status === 'rejected' ? 'badge-rejected' : 'badge-pending'} small` }, l.status.replace('_', ' ')),
                      ]),
                      l.reason && h('p', { className: 'muted', style: { fontSize: '11px', margin: '2px 0 0' } }, l.reason),
                    ])),
                  ]),
                ]);
              })
            ),
          ]),
          !empLeaveData && !empLeaveBusy && h('div', { className: 'card' }, [
            h(EmptyState, {
              title: 'View Your Leave Balances',
              message: 'Click "Load My Balances" to see your current leave entitlements, approved leaves, pending requests, and remaining balances.',
              actionLabel: 'Load My Balances',
              onAction: async () => {
                if (!token || !user) return setMessage('Login required');
                setEmpLeaveBusy(true);
                try {
                  const data = await apiRequest(`/api/leaves/employee/${user.employeeId}`, token);
                  setEmpLeaveData(data);
                } catch (err) { setMessage(err.error || 'Failed to load'); }
                finally { setEmpLeaveBusy(false); }
              },
            }),
          ]),
        ]),

        // ===== ORGANIZATION CHART =====
        tab === 'org-chart' && canView('employees-section') && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Organization Structure'),
                h('h2', null, '📊 Organization Chart'),
                h('p', { className: 'muted' }, `View the company hierarchy and department structure`),
              ]),
              h('button', { className: 'btn primary small', onClick: async () => {
                try {
                  const data = await apiRequest('/api/employees-management/org-chart', token);
                  setCompanyData(prev => ({ ...prev, orgChart: data }));
                  setMessage('✅ Org chart loaded');
                } catch (err) { setMessage(err.error || 'Failed to load'); }
              } }, '🔄 Load Org Chart'),
            ]),
          ]),

          // Stats overview
          companyData?.orgChart && h('div', { className: 'stats-grid', style: { marginBottom: '16px' } }, [
            h(StatTile, { label: 'Total Employees', value: companyData.orgChart.totalEmployees, variant: 'white' }),
            h(StatTile, { label: 'Admins', value: companyData.orgChart.totalAdmins, variant: 'light' }),
            h(StatTile, { label: 'Managers', value: companyData.orgChart.totalManagers, variant: 'white' }),
            h(StatTile, { label: 'Staff', value: companyData.orgChart.totalStaff, variant: 'light' }),
          ]),

          // Org Chart Tree
          companyData?.orgChart && h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [h('h3', null, '👑 Company Hierarchy')]),
            ]),
            h('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' } }, [
              // Root - Company
              h('div', { style: { textAlign: 'center', padding: '16px', background: 'linear-gradient(135deg, #1976d2, #1565c0)', color: '#fff', borderRadius: '12px', fontWeight: 700, fontSize: '18px' } }, '🏢 A K S Reyadah Trading L.L.C'),

              // Admins Level
              companyData.orgChart.hierarchy.admins.length > 0 && h('div', null, [
                h('p', { style: { fontWeight: 600, color: '#1976d2', marginBottom: '8px', textAlign: 'center' } }, '━━━ Administrators ━━━'),
                h('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' } },
                  companyData.orgChart.hierarchy.admins.map((a, i) => h('div', { key: i, style: { padding: '12px', background: 'var(--accent-soft)', borderRadius: '10px', textAlign: 'center', minWidth: '150px', border: '2px solid #1976d2' } }, [
                    a.photoUrl
                      ? h('img', { src: a.photoUrl, style: { width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px' } })
                      : h('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: '#1976d2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, margin: '0 auto 8px' } }, initialsFrom(a.name)),
                    h('strong', { style: { fontSize: '13px' } }, a.name),
                    h('p', { style: { fontSize: '11px', color: '#666' } }, a.title),
                  ]))
                ),
              ]),

              // Managers Level
              companyData.orgChart.hierarchy.managers.length > 0 && h('div', null, [
                h('p', { style: { fontWeight: 600, color: '#f57c00', marginBottom: '8px', textAlign: 'center' } }, '━━━ Managers ━━━'),
                h('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' } },
                  companyData.orgChart.hierarchy.managers.map((m, i) => h('div', { key: i, style: { padding: '12px', background: 'var(--accent-soft)', borderRadius: '10px', textAlign: 'center', minWidth: '150px', border: '2px solid #f57c00' } }, [
                    m.photoUrl
                      ? h('img', { src: m.photoUrl, style: { width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px' } })
                      : h('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: '#f57c00', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, margin: '0 auto 8px' } }, initialsFrom(m.name)),
                    h('strong', { style: { fontSize: '13px' } }, m.name),
                    h('p', { style: { fontSize: '11px', color: '#666' } }, m.title),
                  ]))
                ),
              ]),

              // Staff Level
              companyData.orgChart.hierarchy.staff.length > 0 && h('div', null, [
                h('p', { style: { fontWeight: 600, color: '#388e3c', marginBottom: '8px', textAlign: 'center' } }, '━━━ Staff ━━━'),
                h('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' } },
                  companyData.orgChart.hierarchy.staff.map((s, i) => h('div', { key: i, style: { padding: '12px', background: 'var(--accent-soft)', borderRadius: '10px', textAlign: 'center', minWidth: '140px', border: '2px solid #388e3c' } }, [
                    s.photoUrl
                      ? h('img', { src: s.photoUrl, style: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px' } })
                      : h('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: '#388e3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, margin: '0 auto 8px' } }, initialsFrom(s.name)),
                    h('strong', { style: { fontSize: '12px' } }, s.name),
                    h('p', { style: { fontSize: '11px', color: '#666' } }, s.title),
                  ]))
                ),
              ]),
            ]),
          ]),

          // Department breakdown
          companyData?.orgChart?.departments && h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [h('h3', null, '🏢 Departments')]),
            ]),
            h('div', { style: { padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' } },
              Object.entries(companyData.orgChart.departments).map(([deptName, members]) => h('div', { key: deptName, style: { padding: '12px', background: 'var(--accent-soft)', borderRadius: '10px', border: '1px solid var(--border)' } }, [
                h('strong', { style: { fontSize: '14px', color: '#1976d2' } }, `${deptName} (${members.length})`),
                members.map((m, i) => h('div', { key: i, style: { padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' } }, [
                  h('span', { style: { fontWeight: 500 } }, m.name),
                  h('span', { className: 'muted' }, ` · ${m.title}`),
                ])),
              ]))
            ),
          ]),

          !companyData?.orgChart && h('div', { className: 'card' }, [
            h(EmptyState, {
              title: 'No data loaded',
              message: 'Click "Load Org Chart" to view the company hierarchy.',
              actionLabel: 'Load Org Chart',
              onAction: async () => {
                try {
                  const data = await apiRequest('/api/employees-management/org-chart', token);
                  setCompanyData(prev => ({ ...prev, orgChart: data }));
                } catch (err) { setMessage(err.error || 'Failed to load'); }
              },
            }),
          ]),
        ]),

        tab === 'company' && user.role === 'admin' && h('div', { className: 'company-page' }, [
          h('div', { className: 'company-hero card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, '🏢 Company Overview'),
                h('h2', null, 'Reyadah - Company Dashboard'),
                h('p', { className: 'muted' }, 'View all employees, company assets, and documents across the organization.'),
              ]),
              h('button', {
                className: 'btn secondary small',
                onClick: async () => {
                  setCompanyBusy(true);
                  setMessage('Loading company data...');
                  try {
                    const assetsData = await apiRequest('/api/company/assets', token);
                    const docsData = await apiRequest('/api/company/documents', token);
                    setCompanyData({ assets: assetsData, documents: docsData });
                    setMessage('Company data loaded successfully');
                  } catch (err) {
                    setMessage(err.error || 'Failed to load company data');
                  } finally { setCompanyBusy(false); }
                },
                disabled: companyBusy,
              }, companyBusy ? 'Loading...' : '🔄 Refresh Company Data'),
            ]),
            h('div', { className: 'company-stats-grid' }, [
              h(StatTile, { label: 'Total Employees', value: employees.length, variant: 'white', hint: `${roleCounts.employee || 0} staff` }),
              h(StatTile, { label: 'Company Assets', value: companyData?.assets?.total || 0, variant: 'light', hint: 'Across all employees' }),
              h(StatTile, { label: 'Company Docs', value: companyData?.documents?.total || 0, variant: 'white', hint: 'All employee documents' }),
              h(StatTile, { label: 'Total Team Docs', value: totalTeamDocuments, variant: 'light', hint: 'Uploaded records' }),
            ]),
          ]),

          // Tabs
          h('div', { className: 'company-tabs' }, [
            h('button', {
              className: `btn ${companyTab === 'employees' ? 'primary' : 'secondary'} small`,
              onClick: () => setCompanyTab('employees'),
            }, '👥 All Employees'),
            h('button', {
              className: `btn ${companyTab === 'assets' ? 'primary' : 'secondary'} small`,
              onClick: () => { setCompanyTab('assets'); if (!companyData?.assets) { setCompanyBusy(true); apiRequest('/api/company/assets', token).then(d => setCompanyData(prev => ({ ...prev, assets: d }))).catch(() => {}).finally(() => setCompanyBusy(false)); } },
            }, '📦 Company Assets'),
            h('button', {
              className: `btn ${companyTab === 'documents' ? 'primary' : 'secondary'} small`,
              onClick: () => { setCompanyTab('documents'); if (!companyData?.documents) { setCompanyBusy(true); apiRequest('/api/company/documents', token).then(d => setCompanyData(prev => ({ ...prev, documents: d }))).catch(() => {}).finally(() => setCompanyBusy(false)); } },
            }, '📄 Company Documents'),
            h('button', {
              className: `btn ${companyTab === 'employee-docs' ? 'primary' : 'secondary'} small`,
              onClick: () => setCompanyTab('employee-docs'),
            }, '📋 Employee Documents'),
          ]),

          // === TAB: All Employees ===
          companyTab === 'employees' && h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [h('h2', null, '👥 All Employees'), h('p', { className: 'muted' }, `${employees.length} total employees`)]),
              h('input', {
                value: companySearch,
                onChange: (e) => setCompanySearch(e.target.value),
                placeholder: 'Search by name, ID, email...',
                style: { padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--input-border)' },
              }),
            ]),
            h('div', { className: 'company-employee-grid' },
              employees.filter(e => {
                const s = companySearch.toLowerCase();
                return !s || [e.employeeId, e.name, e.email, e.designation, e.role].filter(Boolean).join(' ').toLowerCase().includes(s);
              }).map(emp => h('div', { key: emp.id, className: 'company-employee-card' }, [
                emp.photoUrl
                  ? h('img', { src: emp.photoUrl, className: 'company-emp-avatar', alt: emp.name })
                  : h('div', { className: 'company-emp-avatar placeholder' }, initialsFrom(emp.name)),
                h('div', { className: 'company-emp-info' }, [
                  h('strong', null, emp.name || 'Unnamed'),
                  h('span', { className: 'muted' }, `${emp.employeeId} · ${formatRole(emp.role)}`),
                  h('span', { className: 'muted' }, emp.designation || 'No designation'),
                ]),
                h('div', { className: 'company-emp-badges' }, [
                  h('span', { className: `badge ${emp.shiftRoster?.shiftName ? 'badge-success' : 'badge-rejected'} small` }, emp.shiftRoster?.shiftName || 'No Shift'),
                  h('span', { className: 'badge badge-pending small' }, `${(emp.documents || []).length} docs`),
                  h('span', { className: 'badge small' }, `${(emp.assets || []).length} assets`),
                ]),
              ]))
            ),
          ]),

          // === TAB: Company Assets - Professional Asset Management System ===
          companyTab === 'assets' && h('div', { className: 'asset-mgmt-page' }, [
            // Overview Stats Cards
            h('div', { className: 'asset-stats-grid' }, [
              h('div', { className: 'asset-stat-card total' }, [
                h('span', { className: 'asset-stat-icon' }, '📦'),
                h('div', null, [
                  h('span', { className: 'asset-stat-value' }, companyData?.assets?.total || 0),
                  h('span', { className: 'asset-stat-label' }, 'Total Assets'),
                ]),
              ]),
              h('div', { className: 'asset-stat-card assigned' }, [
                h('span', { className: 'asset-stat-icon' }, '✅'),
                h('div', null, [
                  h('span', { className: 'asset-stat-value' }, companyData?.assets?.assigned || 0),
                  h('span', { className: 'asset-stat-label' }, 'Assigned'),
                ]),
              ]),
              h('div', { className: 'asset-stat-card available' }, [
                h('span', { className: 'asset-stat-icon' }, '📋'),
                h('div', null, [
                  h('span', { className: 'asset-stat-value' }, companyData?.assets?.available || 0),
                  h('span', { className: 'asset-stat-label' }, 'Available'),
                ]),
              ]),
              h('div', { className: 'asset-stat-card maintenance' }, [
                h('span', { className: 'asset-stat-icon' }, '🔧'),
                h('div', null, [
                  h('span', { className: 'asset-stat-value' }, companyData?.assets?.maintenance || 0),
                  h('span', { className: 'asset-stat-label' }, 'Maintenance'),
                ]),
              ]),
            ]),

            // Add Asset Button + Assets by Type Summary
            h('div', { className: 'asset-toolbar' }, [
              h('button', {
                className: 'btn primary',
                onClick: () => {
                  setCompanyTab('add-asset');
                  setNewAsset({ name: '', serialNumber: '', assetType: '', model: '', description: '', price: '', purchaseDate: '', status: 'available' });
                  setEmployeeDocFile(null);
                },
              }, '➕ Add New Asset'),
              companyData?.assets?.summary?.byType && h('div', { className: 'asset-type-pills' },
                Object.entries(companyData.assets.summary.byType).map(([type, count]) => h('span', { key: type, className: 'asset-type-pill' }, [`${type}: ${count}`]))
              ),
              h('button', {
                className: 'btn secondary small',
                onClick: async () => {
                  setCompanyBusy(true);
                  try {
                    const d = await apiRequest('/api/company/assets', token);
                    setCompanyData(prev => ({ ...prev, assets: d }));
                  } catch(e) { setMessage('Failed to reload assets'); }
                  finally { setCompanyBusy(false); }
                },
                disabled: companyBusy,
              }, companyBusy ? 'Loading...' : '🔄 Refresh'),
            ]),

            // Loading / Empty / Asset List
            companyBusy && companyTab !== 'add-asset' ? h('p', { className: 'muted', style: { textAlign: 'center', padding: '32px' } }, 'Loading assets...') :
            !companyData?.assets ? h(EmptyState, { title: 'No data loaded', message: 'Click Refresh to load assets.', actionLabel: 'Refresh', onAction: async () => { setCompanyBusy(true); try { const d = await apiRequest('/api/company/assets', token); setCompanyData(prev => ({ ...prev, assets: d })); } catch(e) {} finally { setCompanyBusy(false); } } }) :
            companyData.assets.assets.length === 0 ? h(EmptyState, { title: 'No assets registered', message: 'Click "Add New Asset" to register your first company asset.', actionLabel: 'Add Asset', onAction: () => { setCompanyTab('add-asset'); setNewAsset({ name: '', serialNumber: '', assetType: '', model: '', description: '', price: '', purchaseDate: '', status: 'available' }); } }) :

            // Asset Cards Grouped by Type
            h('div', { className: 'asset-list' },
              Object.entries(
                (companyData.assets.assets || []).reduce((groups, asset) => {
                  const type = asset.assetType || 'Uncategorized';
                  if (!groups[type]) groups[type] = [];
                  groups[type].push(asset);
                  return groups;
                }, {})
              ).map(([type, typeAssets]) => h('div', { key: type, className: 'asset-type-group' }, [
                h('div', { className: 'asset-type-header' }, [
                  h('h3', null, `${type} (${typeAssets.length})`),
                ]),
                h('div', { className: 'asset-grid' },
                  typeAssets.map(asset => {
                    const statusClass = (asset.status || 'assigned').toLowerCase();
                    const statusColor = statusClass === 'assigned' ? 'badge-success' : statusClass === 'available' ? 'badge-pending' : statusClass === 'maintenance' ? 'badge-rejected' : 'badge';
                    return h('div', { key: asset.id, className: 'asset-mgmt-card' }, [
                      h('div', { className: 'asset-mgmt-top' }, [
                        h('div', { className: 'asset-mgmt-icon' }, '📦'),
                        h('div', { className: 'asset-mgmt-info' }, [
                          h('strong', { className: 'asset-mgmt-name' }, asset.name || 'Unnamed'),
                          h('span', { className: 'asset-mgmt-sn' }, `SN: ${asset.serialNumber || 'N/A'}`),
                        ]),
                        h('span', { className: `badge ${statusColor} small` }, (asset.status || 'assigned').toUpperCase()),
                      ]),
                      h('div', { className: 'asset-mgmt-details' }, [
                        h('div', { className: 'asset-mgmt-detail' }, ['📌 ', h('span', null, asset.assetType || 'N/A'), asset.model ? ` · ${asset.model}` : '']),
                        asset.price ? h('div', { className: 'asset-mgmt-detail' }, ['💰 ', h('span', null, `AED ${Number(asset.price).toLocaleString()}`)]) : null,
                        asset.purchaseDate ? h('div', { className: 'asset-mgmt-detail' }, ['📅 ', h('span', null, `Purchased: ${new Date(asset.purchaseDate).toLocaleDateString()}`)]) : null,
                        asset.employeeName ? h('div', { className: 'asset-mgmt-detail assigned-user' }, ['👤 ', h('span', null, `${asset.employeeName} (${asset.employeeId})`)]) : null,
                        asset.description ? h('div', { className: 'asset-mgmt-desc' }, asset.description) : null,
                      ]),
                      h('div', { className: 'asset-mgmt-actions' }, [
                        asset.invoice ? h('a', { href: asset.invoice, target: '_blank', className: 'btn white small' }, '📄 Invoice') : null,
                        h('button', { className: 'btn red small', onClick: async () => {
                          if (!window.confirm(`Delete asset "${asset.name}"?`)) return;
                          try {
                            await apiRequest(`/api/company/assets/${asset.id}`, token, { method: 'DELETE' });
                            setMessage('Asset deleted');
                            const d = await apiRequest('/api/company/assets', token);
                            setCompanyData(prev => ({ ...prev, assets: d }));
                          } catch (err) { setMessage(err.error || 'Delete failed'); }
                        } }, '🗑️ Delete'),
                      ]),
                    ]);
                  })
                ),
              ]))
            ),
          ]),

          // === TAB: Company Documents ===
          companyTab === 'documents' && h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [h('h2', null, '📄 Company Documents'), h('p', { className: 'muted' }, `${companyData?.documents?.total || 0} total documents across all employees`)]),
              h('button', {
                className: 'btn primary small',
                onClick: () => setCompanyDocUpload(prev => ({ ...prev, open: !prev.open })),
              }, companyDocUpload.open ? '✕ Cancel' : '➕ Upload Document'),
            ]),
            // Upload Form
            companyDocUpload.open && h('div', { className: 'card', style: { marginBottom: '16px', padding: '16px' } }, [
              h('div', { className: 'form-grid' }, [
                h('label', { className: 'field' }, [
                  'Employee *',
                  h('select', {
                    value: companyDocUpload.employeeId,
                    onChange: (e) => setCompanyDocUpload(prev => ({ ...prev, employeeId: e.target.value })),
                  }, [
                    h('option', { value: '' }, 'Select employee...'),
                    ...employees.map(emp => h('option', { key: emp.employeeId, value: emp.employeeId }, `${emp.name} (${emp.employeeId})`)),
                  ]),
                ]),
                h('label', { className: 'field' }, [
                  'Document Type',
                  h('input', {
                    value: companyDocUpload.docType,
                    onChange: (e) => setCompanyDocUpload(prev => ({ ...prev, docType: e.target.value })),
                    placeholder: 'Contract, ID, Payslip...',
                  }),
                ]),
                h('label', { className: 'field' }, [
                  'Description',
                  h('input', {
                    value: companyDocUpload.description,
                    onChange: (e) => setCompanyDocUpload(prev => ({ ...prev, description: e.target.value })),
                    placeholder: 'Optional notes',
                  }),
                ]),
                h('label', { className: 'field' }, [
                  'File *',
                  h('input', {
                    type: 'file',
                    onChange: (e) => setCompanyDocUpload(prev => ({ ...prev, file: e.target.files && e.target.files[0] })),
                  }),
                ]),
                companyDocUpload.file && h('p', { className: 'req-file-name' }, '📎 ' + companyDocUpload.file.name),
              ]),
              h('div', { className: 'form-actions' }, [
                h('button', {
                  className: 'btn primary',
                  onClick: async () => {
                    if (!companyDocUpload.employeeId || !companyDocUpload.file) return setMessage('Select an employee and file');
                    setCompanyBusy(true);
                    try {
                      const form = new FormData();
                      form.append('file', companyDocUpload.file);
                      form.append('docType', companyDocUpload.docType || 'General');
                      form.append('description', companyDocUpload.description || '');
                      await apiRequest(`/api/employees/${companyDocUpload.employeeId}/documents`, token, { method: 'POST', body: form });
                      setMessage('✅ Document uploaded successfully!');
                      setCompanyDocUpload({ open: false, employeeId: '', docType: '', description: '', file: null });
                      const d = await apiRequest('/api/company/documents', token);
                      setCompanyData(prev => ({ ...prev, documents: d }));
                    } catch (err) { setMessage(err.error || 'Upload failed'); }
                    finally { setCompanyBusy(false); }
                  },
                  disabled: companyBusy || !companyDocUpload.employeeId || !companyDocUpload.file,
                }, companyBusy ? 'Uploading...' : '📤 Upload Document'),
              ]),
            ]),
            companyBusy && !companyDocUpload.open ? h('p', { className: 'muted' }, 'Loading...') :
            !companyData?.documents ? h(EmptyState, { title: 'No data loaded', message: 'Click "Refresh Company Data" above to load documents.', actionLabel: 'Refresh', onAction: async () => { setCompanyBusy(true); try { const d = await apiRequest('/api/company/documents', token); setCompanyData(prev => ({ ...prev, documents: d })); } catch(e) {} finally { setCompanyBusy(false); } } }) :
            h('div', null, [
              companyData.documents.summary && h('div', { className: 'company-subsection', style: { marginBottom: '16px' } }, [
                h('h3', null, '📊 Document Summary by Type'),
                h('div', { className: 'company-summary-grid' },
                  Object.entries(companyData.documents.summary.byType || {}).map(([type, count]) => h('div', { key: type, className: 'company-summary-pill' }, [`${type}: ${count}`]))
                ),
              ]),
              h('div', { className: 'company-doc-list' },
                (companyData.documents.documents || []).map((doc, idx) => h('div', { key: idx, className: 'company-doc-item' }, [
                  h('div', { className: 'company-doc-icon' }, '📄'),
                  h('div', { className: 'company-doc-info' }, [
                    h('a', { href: doc.url, target: '_blank', style: { fontWeight: 600 } }, doc.originalname || 'Document'),
                    h('span', { className: 'muted' }, `${doc.docType || 'General'} · ${(doc.size || 0) > 0 ? Math.round(doc.size / 1024) + ' KB' : ''}`),
                    doc.employeeName && h('span', { className: 'muted' }, `👤 ${doc.employeeName} (${doc.employeeId})`),
                    h('span', { className: 'muted' }, `Uploaded: ${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'N/A'}`),
                  ]),
                ]))
              ),
            ]),
          ]),

          // === TAB: Employee Documents ===
          companyTab === 'employee-docs' && h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [h('h2', null, '📋 Employee Documents'), h('p', { className: 'muted' }, 'Search for an employee to view and manage their uploaded documents.')]),
              h('input', {
                value: companyLookupEmpId,
                onChange: async (e) => {
                  setCompanyLookupEmpId(e.target.value);
                  setEmpDocUpload(prev => ({ ...prev, open: false }));
                  if (e.target.value.length >= 2) {
                    setCompanyLookupBusy(true);
                    try {
                      const results = await apiRequest(`/api/employees/search/query?q=${encodeURIComponent(e.target.value)}`, token);
                      if (results.length > 0) {
                        const docData = await apiRequest(`/api/company/employee-documents/${results[0].employeeId}`, token);
                        setCompanyLookupDocs(docData);
                      }
                    } catch (err) { setMessage(err.error || 'Search failed'); }
                    finally { setCompanyLookupBusy(false); }
                  }
                },
                placeholder: 'Search employee by ID or name...',
                style: { padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--input-border)' },
              }),
            ]),
            companyLookupBusy ? h('p', { className: 'muted' }, 'Searching...') :
            companyLookupDocs ? h('div', null, [
              h('div', { className: 'doc-item', style: { marginBottom: '16px', background: 'var(--accent-soft)' } }, [
                h('div', null, [
                  h('strong', null, companyLookupDocs.employee.name || companyLookupDocs.employee.employeeId),
                  h('p', { className: 'muted' }, `${companyLookupDocs.employee.employeeId} · ${companyLookupDocs.employee.designation || 'No designation'}`),
                ]),
                h('span', { className: 'badge' }, `${companyLookupDocs.total} document(s)`),
                h('button', {
                  className: 'btn primary small',
                  onClick: () => setEmpDocUpload(prev => ({ ...prev, open: !prev.open })),
                  style: { marginLeft: '12px' },
                }, empDocUpload.open ? '✕ Cancel' : '➕ Add Document'),
              ]),
              // Employee Document Upload Form
              empDocUpload.open && h('div', { className: 'card', style: { marginBottom: '16px', padding: '16px' } }, [
                h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, [
                    'Document Type',
                    h('input', {
                      value: empDocUpload.docType,
                      onChange: (e) => setEmpDocUpload(prev => ({ ...prev, docType: e.target.value })),
                      placeholder: 'Contract, ID, Payslip...',
                    }),
                  ]),
                  h('label', { className: 'field' }, [
                    'Description',
                    h('input', {
                      value: empDocUpload.description,
                      onChange: (e) => setEmpDocUpload(prev => ({ ...prev, description: e.target.value })),
                      placeholder: 'Optional notes',
                    }),
                  ]),
                  h('label', { className: 'field' }, [
                    'File *',
                    h('input', {
                      type: 'file',
                      onChange: (e) => setEmpDocUpload(prev => ({ ...prev, file: e.target.files && e.target.files[0] })),
                    }),
                  ]),
                  empDocUpload.file && h('p', { className: 'req-file-name' }, '📎 ' + empDocUpload.file.name),
                ]),
                h('div', { className: 'form-actions' }, [
                  h('button', {
                    className: 'btn primary',
                    onClick: async () => {
                      if (!empDocUpload.file) return setMessage('Select a file to upload');
                      const empId = companyLookupDocs.employee.employeeId;
                      setCompanyBusy(true);
                      try {
                        const form = new FormData();
                        form.append('file', empDocUpload.file);
                        form.append('docType', empDocUpload.docType || 'General');
                        form.append('description', empDocUpload.description || '');
                        await apiRequest(`/api/employees/${empId}/documents`, token, { method: 'POST', body: form });
                        setMessage('✅ Document uploaded successfully!');
                        setEmpDocUpload({ open: false, docType: '', description: '', file: null });
                        const docData = await apiRequest(`/api/company/employee-documents/${empId}`, token);
                        setCompanyLookupDocs(docData);
                      } catch (err) { setMessage(err.error || 'Upload failed'); }
                      finally { setCompanyBusy(false); }
                    },
                    disabled: companyBusy || !empDocUpload.file,
                  }, companyBusy ? 'Uploading...' : '📤 Upload Document'),
                ]),
              ]),
              companyLookupDocs.documents.length > 0
                ? companyLookupDocs.documents.map((doc, idx) => h('div', { key: idx, className: 'doc-item' }, [
                    h('div', null, [
                      h('a', { href: doc.url, target: '_blank' }, doc.originalname || 'Document'),
                      h('p', { className: 'muted' }, `${doc.docType || 'General'} · ${doc.description || ''} · ${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ''}`),
                    ]),
                    h('span', { className: 'badge badge-pending small' }, doc.docType || 'General'),
                  ]))
                : h('p', { className: 'muted' }, 'No documents uploaded for this employee.'),
              h('button', { className: 'btn secondary small', onClick: () => { setCompanyLookupEmpId(''); setCompanyLookupDocs(null); setEmpDocUpload({ open: false, docType: '', description: '', file: null }); }, style: { marginTop: '12px' } }, 'Clear'),
            ]) : h(EmptyState, { title: 'Search for an employee', message: 'Type an employee ID or name above to view and manage their documents.' }),
          ]),
        ]),

        // === ADD ASSET FORM (moved outside assets tab to prevent disappearing when companyTab changes) ===
        companyTab === 'add-asset' && h('div', { className: 'asset-form-card card' }, [
          h('div', { className: 'asset-form-header' }, [
            h('h3', null, '📝 Add New Asset'),
            h('p', { className: 'muted' }, 'Fill in the details below to register a new company asset.'),
            h('button', { className: 'btn white small', onClick: () => setCompanyTab('assets') }, '✕ Cancel'),
          ]),
          h('div', { className: 'asset-form-grid' }, [
            h('label', { className: 'field' }, ['Asset Name *', h('input', { value: newAsset.name, onChange: (e) => setNewAsset(prev => ({ ...prev, name: e.target.value })), placeholder: 'e.g. Dell Latitude 5420' })]),
            h('label', { className: 'field' }, ['Serial Number *', h('input', { value: newAsset.serialNumber, onChange: (e) => setNewAsset(prev => ({ ...prev, serialNumber: e.target.value })), placeholder: 'e.g. SN-2024-001' })]),
            h('label', { className: 'field' }, ['Asset Type *', h('select', { value: newAsset.assetType, onChange: (e) => setNewAsset(prev => ({ ...prev, assetType: e.target.value })) }, [
              h('option', { value: '' }, 'Select type...'),
              h('option', { value: 'Laptop' }, '💻 Laptop'),
              h('option', { value: 'Desktop' }, '🖥️ Desktop'),
              h('option', { value: 'Monitor' }, '🖥️ Monitor'),
              h('option', { value: 'Keyboard' }, '⌨️ Keyboard'),
              h('option', { value: 'Mouse' }, '🖱️ Mouse'),
              h('option', { value: 'Phone' }, '📱 Phone'),
              h('option', { value: 'Tablet' }, '📟 Tablet'),
              h('option', { value: 'Printer' }, '🖨️ Printer'),
              h('option', { value: 'Networking' }, '🌐 Networking'),
              h('option', { value: 'Furniture' }, '🪑 Furniture'),
              h('option', { value: 'Vehicle' }, '🚗 Vehicle'),
              h('option', { value: 'Other' }, '📦 Other'),
            ])]),
            h('label', { className: 'field' }, ['Model', h('input', { value: newAsset.model, onChange: (e) => setNewAsset(prev => ({ ...prev, model: e.target.value })), placeholder: 'e.g. Latitude 5420' })]),
            h('label', { className: 'field' }, ['Price (AED)', h('input', { type: 'number', value: newAsset.price, onChange: (e) => setNewAsset(prev => ({ ...prev, price: e.target.value })), placeholder: 'e.g. 4500' })]),
            h('label', { className: 'field' }, ['Purchase Date', h('input', { type: 'date', value: newAsset.purchaseDate, onChange: (e) => setNewAsset(prev => ({ ...prev, purchaseDate: e.target.value })) })]),
            h('label', { className: 'field' }, ['Status', h('select', { value: newAsset.status, onChange: (e) => setNewAsset(prev => ({ ...prev, status: e.target.value })) }, [
              h('option', { value: 'available' }, '📋 Available'),
              h('option', { value: 'assigned' }, '✅ Assigned'),
              h('option', { value: 'maintenance' }, '🔧 Maintenance'),
              h('option', { value: 'retired' }, '🗑️ Retired'),
            ])]),
            h('label', { className: 'field' }, ['Assign To Employee', h('select', { value: newAsset.assignToEmployeeId || '', onChange: (e) => setNewAsset(prev => ({ ...prev, assignToEmployeeId: e.target.value, status: e.target.value ? 'assigned' : prev.status })) }, [
              h('option', { value: '' }, '— Not assigned —'),
              ...employees.map(emp => h('option', { key: emp.employeeId, value: emp.employeeId }, `${emp.name} (${emp.employeeId})`)),
            ])]),
            h('label', { className: 'field' }, ['Invoice / Receipt', h('input', { type: 'file', accept: 'image/*,.pdf', onChange: (e) => setEmployeeDocFile(e.target.files && e.target.files[0]) })]),
            employeeDocFile && h('p', { className: 'req-file-name' }, '📎 ' + employeeDocFile.name),
            h('label', { className: 'field', style: { gridColumn: 'span 2' } }, ['Description', h('textarea', { value: newAsset.description, onChange: (e) => setNewAsset(prev => ({ ...prev, description: e.target.value })), rows: 3, placeholder: 'Optional notes about the asset...' })]),
          ]),
          h('div', { className: 'form-actions' }, [
            h('button', { className: 'btn primary', onClick: async () => {
              if (!newAsset.name || !newAsset.assetType) return setMessage('Asset name and type are required');
              setCompanyBusy(true);
              try {
                const form = new FormData();
                form.append('name', newAsset.name);
                form.append('serialNumber', newAsset.serialNumber);
                form.append('assetType', newAsset.assetType);
                form.append('model', newAsset.model || '');
                form.append('price', newAsset.price || 0);
                form.append('purchaseDate', newAsset.purchaseDate || '');
                form.append('description', newAsset.description || '');
                form.append('status', newAsset.assignToEmployeeId ? 'assigned' : newAsset.status);
                if (newAsset.assignToEmployeeId) form.append('assignToEmployeeId', newAsset.assignToEmployeeId);
                if (employeeDocFile) form.append('invoice', employeeDocFile);
                await apiRequest('/api/company/assets', token, { method: 'POST', body: form });
                setMessage('✅ Asset added successfully!');
                setCompanyTab('assets');
                setEmployeeDocFile(null);
                const d = await apiRequest('/api/company/assets', token);
                setCompanyData(prev => ({ ...prev, assets: d }));
              } catch (err) { setMessage(err.error || 'Failed to add asset'); }
              finally { setCompanyBusy(false); }
            }, disabled: companyBusy || !newAsset.name || !newAsset.assetType }, companyBusy ? 'Saving...' : '💾 Save Asset'),
            h('button', { className: 'btn secondary', onClick: () => setCompanyTab('assets') }, 'Cancel'),
          ]),
        ]),

        tab === 'help' && h('div', { className: 'grid' }, [
          h('div', { className: 'card' }, [
            h('div', { className: 'panel-heading' }, [
              h('div', null, [
                h('p', { className: 'eyebrow' }, 'Help & Support'),
                h('h2', null, '❓ Help Center'),
                h('p', { className: 'muted' }, 'Learn how to use the Reyadah HR system. Find answers to common questions and get support.'),
              ]),
            ]),
            h('div', { className: 'help-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', padding: '16px' } }, [
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '📸 Attendance'),
                h('p', { className: 'muted' }, 'Clock in/out using face recognition. Use the camera button on the home page or attendance tab. Make sure you have good lighting and face the camera directly.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• Click "Clock In" on the home page'),
                  h('p', null, '• Allow camera access when prompted'),
                  h('p', null, '• Take a clear selfie to verify your identity'),
                  h('p', null, '• Repeat for clock out at end of shift'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '📄 Documents'),
                h('p', { className: 'muted' }, 'Upload and manage your HR documents like contracts, IDs, and payslips. Documents are stored securely in the cloud.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• Go to Document Center in the sidebar'),
                  h('p', null, '• Select document type and upload file'),
                  h('p', null, '• Add issue/expiry dates for tracking'),
                  h('p', null, '• View uploaded documents anytime'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '📅 Leave Management'),
                h('p', { className: 'muted' }, 'Apply for leave, check your balances, and track approval status. Leave requests go through manager and company approval.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• Apply for leave in the Leave section'),
                  h('p', null, '• Choose leave type (Annual, PH, Sick, etc.)'),
                  h('p', null, '• Select dates and provide a reason'),
                  h('p', null, '• Track approval status in real-time'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '💰 Payroll & Payslips'),
                h('p', { className: 'muted' }, 'View your payslips, check salary breakdowns, and download PDF statements. Payroll is processed monthly.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• View payslips in the Payslips section'),
                  h('p', null, '• Download PDF for each payslip'),
                  h('p', null, '• Check salary breakdown and deductions'),
                  h('p', null, '• Contact HR for payroll questions'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '✈️ Request Hub'),
                h('p', { className: 'muted' }, 'Submit tickets, expense claims, loan applications, medical reimbursements, and air ticket requests all in one place.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• Go to Request Hub in the sidebar'),
                  h('p', null, '• Choose the type of request'),
                  h('p', null, '• Fill in the required details'),
                  h('p', null, '• Attach supporting documents if needed'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '🤖 AI Assistant'),
                h('p', { className: 'muted' }, 'Use the AI chatbot for instant answers about your attendance, leave balance, payslips, and more. Look for the robot icon in the bottom-right corner.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• Click the 🤖 icon to open the chat'),
                  h('p', null, '• Ask questions like "My attendance"'),
                  h('p', null, '• Get instant answers 24/7'),
                  h('p', null, '• Try "Help" for available commands'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '👤 Profile'),
                h('p', { className: 'muted' }, 'Manage your profile, upload documents, view your assigned assets, and check your attendance history.'),
                h('div', { style: { marginTop: '12px', fontSize: '13px' } }, [
                  h('p', null, '• View your profile from the sidebar'),
                  h('p', null, '• Upload profile photo'),
                  h('p', null, '• Add documents to your profile'),
                  h('p', null, '• View assigned assets'),
                ]),
              ]),
              h('div', { className: 'card help-card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                h('h3', null, '🆘 Need More Help?'),
                h('p', { className: 'muted' }, 'Contact us directly for immediate assistance.'),
                h('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } }, [
                  h('a', { href: 'https://wa.me/971543093091', target: '_blank', className: 'contact-link', style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', border: '1px solid var(--border)', transition: 'all 0.2s' } }, [
                    h('span', { style: { fontSize: '24px' } }, '💬'),
                    h('span', null, [
                      h('strong', null, 'WhatsApp'),
                      h('span', { style: { display: 'block', fontSize: '12px', color: 'var(--muted)' } }, '+971 54 309 3091'),
                    ]),
                  ]),
                  h('a', { href: 'tel:+971543093091', className: 'contact-link', style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', border: '1px solid var(--border)', transition: 'all 0.2s' } }, [
                    h('span', { style: { fontSize: '24px' } }, '📞'),
                    h('span', null, [
                      h('strong', null, 'Call'),
                      h('span', { style: { display: 'block', fontSize: '12px', color: 'var(--muted)' } }, '+971 54 309 3091'),
                    ]),
                  ]),
                  h('a', { href: 'mailto:samee@reyadah.ae', className: 'contact-link', style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', border: '1px solid var(--border)', transition: 'all 0.2s' } }, [
                    h('span', { style: { fontSize: '24px' } }, '✉️'),
                    h('span', null, [
                      h('strong', null, 'Email'),
                      h('span', { style: { display: 'block', fontSize: '12px', color: 'var(--muted)' } }, 'samee@reyadah.ae'),
                    ]),
                  ]),
                ]),
                h('p', { style: { marginTop: '12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' } }, 'Or submit a support ticket in Request Hub / ask the AI Assistant'),
              ]),
            ]),
          ]),
        ]),
        tab === 'admin' && user.role === 'admin' && h('div', { className: 'admin-shell' }, [
          h('div', { className: 'admin-toolbar' }, [
            ['team', 'bulkUpload', 'leaveBalances', 'employeeLeave', 'applyLeave', 'faceRegister', 'assignAsset', 'assignShift', 'tickets', 'zkteco', 'biometric', 'reports', 'holidays', 'departments', 'auditLog', 'eos'].map((page) => h('button', {
              key: page,
              className: adminPage === page ? 'btn primary small' : 'btn secondary small',
              onClick: () => setAdminPage(page),
            }, adminPageLabels[page] || page)),
            h('div', { style: { marginLeft: 12, display: 'flex', gap: 8 } }, [
              h('button', { className: 'btn secondary small', onClick: () => createSampleManager('restaurant-manager') }, 'Create sample RM'),
            h('button', { className: 'btn secondary small', onClick: () => createSampleManager('company-manager') }, 'Create sample CM'),
            ]),
          ]),
          adminPage === 'employeeLeave' && h('div', { className: 'adm-leave-mgmt' }, [
            h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Employee Leave'),
                  h('h2', null, 'Manage Leave Entitlements'),
                  h('p', { className: 'muted' }, 'Search an employee, view their leave balances and history, and update per-leave-type entitlements (Annual, PH, Sick, Emergency, Other).'),
                ]),
                h('div', { className: 'directory-controls' }, [
                  h('input', {
                    value: empLeaveSearch,
                    onChange: (e) => {
                      setEmpLeaveSearch(e.target.value);
                      if (e.target.value.length >= 2) {
                        setEmpLeaveBusy(true);
                        apiRequest(`/api/employees/search/query?q=${encodeURIComponent(e.target.value)}`, token)
                          .then(results => {
                            setEmpLeaveData({ searchResults: Array.isArray(results) ? results : [] });
                          })
                          .catch(() => setEmpLeaveData({ searchResults: [] }))
                          .finally(() => setEmpLeaveBusy(false));
                      } else {
                        setEmpLeaveData(prev => prev && prev.employee ? prev : null);
                      }
                    },
                    placeholder: 'Search employee by ID or name...',
                  }),
                ]),
              ]),
              empLeaveData && empLeaveData.searchResults && !empLeaveData.employee
                ? h('div', { className: 'emp-leave-search-results' },
                    empLeaveData.searchResults.map(emp => h('div', {
                      key: emp.id,
                      className: 'doc-item employee-row',
                      style: { cursor: 'pointer' },
                      onClick: async () => {
                        setEmpLeaveBusy(true);
                        setEmpLeaveSelectedId(emp.employeeId);
                        try {
                          const data = await apiRequest(`/api/leaves/employee/${emp.employeeId}`, token);
                          setEmpLeaveData(data);
                          setEmpLeaveEntitlements({});
                          for (const key of Object.keys(data.leaveTypes || {})) {
                            setEmpLeaveEntitlements(prev => ({
                              ...prev,
                              [key]: data.leaveTypes[key].entitlement,
                            }));
                          }
                        } catch (err) {
                          setMessage(err.error || 'Failed to load employee leave data');
                        } finally {
                          setEmpLeaveBusy(false);
                        }
                      },
                    }, [
                      h('div', { className: 'employee-info' }, [
                        emp.photoUrl
                          ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name })
                          : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                        h('div', { className: 'employee-meta' }, [
                          h('div', { className: 'employee-name-line' }, [
                            h('strong', null, emp.name || 'Unnamed employee'),
                            h('span', { className: 'employee-id-pill' }, emp.employeeId || ''),
                            h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                          ]),
                          h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                        ]),
                      ]),
                      h('span', { className: 'badge' }, 'Select'),
                    ])))
                : null,
              empLeaveBusy && !empLeaveData?.employee
                ? h('p', { className: 'muted' }, 'Searching...')
                : null,
            ]),
            empLeaveData && empLeaveData.employee && h('div', { className: 'employee-leave-detail' }, [
              h('div', { className: 'card emp-leave-header' }, [
                h('div', { className: 'employee-info' }, [
                  empLeaveData.employee.photoUrl
                    ? h('img', { src: empLeaveData.employee.photoUrl, className: 'employee-avatar large', alt: empLeaveData.employee.name })
                    : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(empLeaveData.employee.name)),
                  h('div', { className: 'employee-meta' }, [
                    h('div', { className: 'employee-name-line' }, [
                      h('strong', null, empLeaveData.employee.name),
                      h('span', { className: 'employee-id-pill' }, empLeaveData.employee.employeeId),
                      h('span', { className: `employee-role-pill role-${empLeaveData.employee.role}` }, formatRole(empLeaveData.employee.role)),
                    ]),
                    h('p', { className: 'employee-summary' }, `${empLeaveData.employee.email || 'No email'} | ${empLeaveData.employee.designation || 'No designation'}`),
                  ]),
                ]),
                h('div', { className: 'profile-card-actions' }, [
                  h('button', {
                    className: 'btn white small',
                    onClick: () => {
                      setEmpLeaveData(null);
                      setEmpLeaveSelectedId('');
                      setEmpLeaveSearch('');
                      setEmpLeaveEntitlements({});
                    },
                  }, 'Clear'),
                ]),
              ]),
              h('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '16px' } },
                Object.keys(empLeaveData.leaveTypes || {}).map(key => {
                  const lt = empLeaveData.leaveTypes[key];
                  const balancePct = lt.entitlement > 0 ? Math.round((lt.balance / lt.entitlement) * 100) : 0;
                  return h('div', { key: key, className: 'card emp-leave-type-card' }, [
                    h('div', { className: 'emp-leave-type-header' }, [
                      h('strong', null, lt.type + ' Leave'),
                      h('span', {
                        className: 'badge ' + (lt.balance > 0 ? (balancePct > 30 ? 'badge-success' : 'badge-pending') : 'badge-rejected'),
                      }, `${lt.balance} remaining`),
                    ]),
                    h('div', { className: 'emp-leave-type-details' }, [
                      h('div', null, [
                        h('span', { className: 'detail-label' }, 'Entitlement'),
                        h('strong', null, lt.entitlement + ' days'),
                      ]),
                      h('div', null, [
                        h('span', { className: 'detail-label' }, 'Approved'),
                        h('span', null, lt.approved + ' days'),
                      ]),
                      h('div', null, [
                        h('span', { className: 'detail-label' }, 'Pending'),
                        h('span', null, lt.pending + ' days'),
                      ]),
                      h('div', null, [
                        h('span', { className: 'detail-label' }, 'Balance'),
                        h('strong', { style: { color: lt.balance > 0 ? '#2e7d32' : '#c62828' } }, lt.balance + ' days'),
                      ]),
                    ]),
                    h('div', { className: 'profile-score-bar', style: { margin: '8px 0' } }, [
                      h('div', {
                        className: 'profile-score-fill',
                        style: { width: balancePct + '%', background: balancePct > 30 ? 'linear-gradient(90deg, #4caf50, #81c784)' : 'linear-gradient(90deg, #ff9800, #ffb74d)' },
                      }),
                    ]),
                    // Leave Adjustment Form
                    h('div', { style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                      h('strong', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, '📝 Adjust Leave Balance'),
                      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' } }, [
                        h('select', {
                          value: empLeaveEntitlements[`_adjustType_${key}`] || 'annual',
                          onChange: (e) => setEmpLeaveEntitlements(prev => ({ ...prev, [`_adjustType_${key}`]: e.target.value })),
                          style: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' },
                        }, [
                          h('option', { value: 'annual' }, 'Annual'),
                          h('option', { value: 'ph' }, 'PH'),
                          h('option', { value: 'sick' }, 'Sick'),
                          h('option', { value: 'emergency' }, 'Emergency'),
                          h('option', { value: 'other' }, 'Other'),
                        ]),
                        h('input', {
                          type: 'number',
                          placeholder: 'Days (+/-)',
                          value: empLeaveEntitlements[`_adjustDays_${key}`] || '',
                          onChange: (e) => setEmpLeaveEntitlements(prev => ({ ...prev, [`_adjustDays_${key}`]: e.target.value })),
                          style: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', width: '80px', fontSize: '12px' },
                        }),
                        h('input', {
                          type: 'text',
                          placeholder: 'Reason',
                          value: empLeaveEntitlements[`_adjustReason_${key}`] || '',
                          onChange: (e) => setEmpLeaveEntitlements(prev => ({ ...prev, [`_adjustReason_${key}`]: e.target.value })),
                          style: { padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1, minWidth: '120px', fontSize: '12px' },
                        }),
                        h('button', {
                          className: 'btn primary small',
                          onClick: async () => {
                            const days = empLeaveEntitlements[`_adjustDays_${key}`];
                            const reason = empLeaveEntitlements[`_adjustReason_${key}`];
                            const adjType = empLeaveEntitlements[`_adjustType_${key}`] || key;
                            if (!days || !reason) return setMessage('Enter days and reason');
                            try {
                              const result = await apiRequest(`/api/leaves/employee/${empLeaveData.employee.employeeId}/adjust`, token, {
                                method: 'POST',
                                body: JSON.stringify({ leaveType: adjType, days: parseFloat(days), reason }),
                              });
                              setMessage(result.message);
                              setEmpLeaveEntitlements(prev => ({ ...prev, [`_adjustDays_${key}`]: '', [`_adjustReason_${key}`]: '' }));
                              const data = await apiRequest(`/api/leaves/employee/${empLeaveData.employee.employeeId}`, token);
                              setEmpLeaveData(data);
                              // Reset entitlement state to match loaded data
                              setEmpLeaveEntitlements(prev => {
                                const updated = { ...prev };
                                for (const k of Object.keys(data.leaveTypes || {})) {
                                  updated[k] = data.leaveTypes[k].entitlement;
                                }
                                return updated;
                              });
                            } catch (err) { setMessage(err.error || 'Failed'); }
                          },
                          disabled: !empLeaveEntitlements[`_adjustDays_${key}`] || !empLeaveEntitlements[`_adjustReason_${key}`],
                        }, 'Apply'),
                      ]),
                    ]),
                    h('div', { className: 'emp-leave-entitlement-edit', style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } }, [
                      h('label', { className: 'field', style: { margin: 0, flex: 1 } }, [
                        'Update entitlement',
                        h('input', {
                          type: 'number',
                          min: 0,
                          value: empLeaveEntitlements[key] ?? lt.entitlement,
                          onChange: (e) => setEmpLeaveEntitlements(prev => ({ ...prev, [key]: e.target.value })),
                          style: { padding: '8px 10px', borderRadius: '8px' },
                        }),
                      ]),
                      h('button', {
                        className: 'btn primary small',
                        style: { marginTop: '18px', alignSelf: 'flex-end' },
                        onClick: async () => {
                          try {
                            const payload = { entitlements: {} };
                            for (const k of Object.keys(empLeaveEntitlements)) {
                              if (!k.startsWith('_')) payload.entitlements[k] = Number(empLeaveEntitlements[k]) || 0;
                            }
                            await apiRequest(`/api/leaves/employee/${empLeaveData.employee.employeeId}/entitlements`, token, {
                              method: 'PUT',
                              body: JSON.stringify(payload),
                            });
                            setMessage('Leave entitlements updated successfully!');
                            const data = await apiRequest(`/api/leaves/employee/${empLeaveData.employee.employeeId}`, token);
                            setEmpLeaveData(data);
                          } catch (err) {
                            setMessage(err.error || 'Failed to update entitlements');
                          }
                        },
                      }, 'Update'),
                    ]),
                    lt.leaves && lt.leaves.length > 0 && h('div', { className: 'emp-leave-history', style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                      h('strong', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, 'History'),
                      lt.leaves.slice(0, 5).map(l => h('div', { key: l.id, className: 'doc-item', style: { padding: '8px 10px', marginTop: '6px' } }, [
                        h('div', null, [
                          h('span', { style: { fontWeight: 600 } }, `${l.startDate} to ${l.endDate}`),
                          h('span', { className: `badge ${l.status === 'approved' ? 'badge-success' : l.status === 'rejected' ? 'badge-rejected' : 'badge-pending'} small`, style: { marginLeft: '8px' } }, l.status.replace('_', ' ')),
                        ]),
                        l.reason && h('p', { className: 'muted', style: { fontSize: '12px', margin: '4px 0 0' } }, l.reason),
                      ])),
                    ]),
                  ]);
                })
              ),
            ]),
          ]),
          adminPage === 'faceRegister' && h('div', { className: 'adm-leave-mgmt' }, [
            h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Face Registration'),
                  h('h2', null, 'Register Employee Face for Attendance'),
                  h('p', { className: 'muted' }, 'Search for an employee and upload a passport-style photo to register their face for attendance verification during clock-in/out.'),
                ]),
                h('div', { className: 'directory-controls' }, [
                  h('input', {
                    value: applyLeaveSearch,
                    onChange: (e) => {
                      setApplyLeaveSearch(e.target.value);
                      searchApplyLeaveEmployee(e.target.value);
                    },
                    placeholder: 'Search employee by ID or name...',
                  }),
                  applyLeaveSearchBusy && h('span', { className: 'badge' }, 'Searching...'),
                ]),
              ]),
              // Search results
              applyLeaveResults.length > 0 && !applyLeaveSelectedEmp
                ? h('div', { className: 'emp-leave-search-results' },
                    applyLeaveResults.map(emp => h('div', {
                      key: emp.id,
                      className: 'doc-item employee-row',
                      style: { cursor: 'pointer' },
                      onClick: () => {
                        setApplyLeaveSelectedEmp(emp);
                        setApplyLeaveForm(prev => ({ ...prev, employeeId: emp.employeeId }));
                        setApplyLeaveResults([]);
                        setApplyLeaveSearch(emp.name + ' (' + emp.employeeId + ')');
                      },
                    }, [
                      h('div', { className: 'employee-info' }, [
                        emp.photoUrl
                          ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name })
                          : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                        h('div', { className: 'employee-meta' }, [
                          h('div', { className: 'employee-name-line' }, [
                            h('strong', null, emp.name || 'Unnamed employee'),
                            h('span', { className: 'employee-id-pill' }, emp.employeeId || ''),
                            h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                          ]),
                          h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                        ]),
                      ]),
                      h('span', { className: 'badge' }, 'Select'),
                    ])))
                : null,
            ]),
            // Selected employee and upload form
            applyLeaveSelectedEmp && h('div', { className: 'card', style: { marginTop: '16px' } }, [
              h('div', { className: 'emp-leave-header' }, [
                h('div', { className: 'employee-info' }, [
                  applyLeaveSelectedEmp.photoUrl
                    ? h('img', { src: applyLeaveSelectedEmp.photoUrl, className: 'employee-avatar large', alt: applyLeaveSelectedEmp.name })
                    : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(applyLeaveSelectedEmp.name)),
                  h('div', { className: 'employee-meta' }, [
                    h('div', { className: 'employee-name-line' }, [
                      h('strong', null, applyLeaveSelectedEmp.name || 'Unnamed'),
                      h('span', { className: 'employee-id-pill' }, applyLeaveSelectedEmp.employeeId || ''),
                      h('span', { className: `employee-role-pill role-${applyLeaveSelectedEmp.role || 'employee'}` }, formatRole(applyLeaveSelectedEmp.role)),
                    ]),
                    h('p', { className: 'employee-summary' }, `${applyLeaveSelectedEmp.email || 'No email'} | ${applyLeaveSelectedEmp.designation || 'No designation'}`),
                    h('p', { className: 'muted', style: { marginTop: '8px' } }, [
                      applyLeaveSelectedEmp.photoUrl ? '✅ Face registered' : '❌ No face registered yet',
                    ]),
                  ]),
                ]),
                h('button', {
                  className: 'btn white small',
                  onClick: () => {
                    setApplyLeaveSelectedEmp(null);
                    setApplyLeaveSearch('');
                    setApplyLeaveResults([]);
                    setEmployeePhotoFile(null);
                  },
                }, 'Change Employee'),
              ]),
              h('div', { className: 'form-grid', style: { marginTop: '16px' } }, [
                h('label', { className: 'field', style: { gridColumn: 'span 2' } }, [
                  'Upload Passport Photo (used for face verification at clock-in/out)',
                  h('input', {
                    type: 'file',
                    accept: 'image/*',
                    onChange: (e) => setEmployeePhotoFile(e.target.files && e.target.files[0]),
                  }),
                ]),
                employeePhotoFile && h('p', { className: 'req-file-name', style: { gridColumn: 'span 2' } }, '📎 ' + employeePhotoFile.name),
                applyLeaveSelectedEmp.photoUrl && h('div', { style: { gridColumn: 'span 2', textAlign: 'center' } }, [
                  h('p', { className: 'muted' }, 'Current registered face:'),
                  h('img', { src: applyLeaveSelectedEmp.photoUrl, alt: 'Current face', style: { width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', marginTop: '8px', border: '3px solid var(--border)' } }),
                ]),
              ]),
              h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [
                h('button', {
                  className: 'btn primary',
                  onClick: async () => {
                    if (!employeePhotoFile) return setMessage('Please select a photo file first');
                    setApplyLeaveBusy(true);
                    try {
                      const form = new FormData();
                      form.append('photo', employeePhotoFile);
                      const result = await apiRequest(`/api/employees/${applyLeaveSelectedEmp.employeeId}/face-photo`, token, { method: 'POST', body: form });
                      setMessage('✅ Face registered successfully! Employee can now use face verification for attendance.');
                      setEmployeePhotoFile(null);
                      // Update selected employee with new face photo
                      setApplyLeaveSelectedEmp(prev => ({ ...prev, facePhotoUrl: result.facePhotoUrl }));
                    } catch (err) {
                      setMessage(err.error || 'Failed to upload face photo');
                    } finally {
                      setApplyLeaveBusy(false);
                    }
                  },
                  disabled: applyLeaveBusy || !employeePhotoFile,
                }, applyLeaveBusy ? 'Uploading...' : '📸 Register Face'),
              ]),
            ]),
          ]),
          adminPage === 'applyLeave' && h('div', { className: 'adm-leave-mgmt' }, [
            h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Apply Leave'),
                  h('h2', null, 'Apply Leave on Behalf of Employee'),
                  h('p', { className: 'muted' }, 'Search for an employee and apply PH, Annual, Sick, Emergency, or Other leave on their behalf. The leave will be auto-approved.'),
                ]),
                h('div', { className: 'directory-controls' }, [
                  h('input', {
                    value: applyLeaveSearch,
                    onChange: (e) => {
                      setApplyLeaveSearch(e.target.value);
                      searchApplyLeaveEmployee(e.target.value);
                    },
                    placeholder: 'Search employee by ID or name...',
                  }),
                  applyLeaveSearchBusy && h('span', { className: 'badge' }, 'Searching...'),
                ]),
              ]),
              // Search results
              applyLeaveResults.length > 0 && !applyLeaveSelectedEmp
                ? h('div', { className: 'emp-leave-search-results' },
                    applyLeaveResults.map(emp => h('div', {
                      key: emp.id,
                      className: 'doc-item employee-row',
                      style: { cursor: 'pointer' },
                      onClick: () => {
                        setApplyLeaveSelectedEmp(emp);
                        setApplyLeaveForm(prev => ({ ...prev, employeeId: emp.employeeId }));
                        setApplyLeaveResults([]);
                        setApplyLeaveSearch(emp.name + ' (' + emp.employeeId + ')');
                      },
                    }, [
                      h('div', { className: 'employee-info' }, [
                        emp.photoUrl
                          ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name })
                          : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                        h('div', { className: 'employee-meta' }, [
                          h('div', { className: 'employee-name-line' }, [
                            h('strong', null, emp.name || 'Unnamed employee'),
                            h('span', { className: 'employee-id-pill' }, emp.employeeId || ''),
                            h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                          ]),
                          h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                        ]),
                      ]),
                      h('span', { className: 'badge' }, 'Select'),
                    ])))
                : null,
            ]),
            // Selected employee and form
            applyLeaveSelectedEmp && h('div', { className: 'card', style: { marginTop: '16px' } }, [
              h('div', { className: 'emp-leave-header' }, [
                h('div', { className: 'employee-info' }, [
                  applyLeaveSelectedEmp.photoUrl
                    ? h('img', { src: applyLeaveSelectedEmp.photoUrl, className: 'employee-avatar large', alt: applyLeaveSelectedEmp.name })
                    : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(applyLeaveSelectedEmp.name)),
                  h('div', { className: 'employee-meta' }, [
                    h('div', { className: 'employee-name-line' }, [
                      h('strong', null, applyLeaveSelectedEmp.name || 'Unnamed'),
                      h('span', { className: 'employee-id-pill' }, applyLeaveSelectedEmp.employeeId || ''),
                      h('span', { className: `employee-role-pill role-${applyLeaveSelectedEmp.role || 'employee'}` }, formatRole(applyLeaveSelectedEmp.role)),
                    ]),
                    h('p', { className: 'employee-summary' }, `${applyLeaveSelectedEmp.email || 'No email'} | ${applyLeaveSelectedEmp.designation || 'No designation'}`),
                  ]),
                ]),
                h('button', {
                  className: 'btn white small',
                  onClick: () => {
                    setApplyLeaveSelectedEmp(null);
                    setApplyLeaveSearch('');
                    setApplyLeaveResults([]);
                    setApplyLeaveForm({ employeeId: '', leaveType: 'PH', startDate: '', endDate: '', reason: '', autoApprove: true });
                  },
                }, 'Change Employee'),
              ]),
              h('div', { className: 'form-grid', style: { marginTop: '16px' } }, [
                h('label', { className: 'field' }, [
                  'Leave Type',
                  h('select', {
                    value: applyLeaveForm.leaveType,
                    onChange: (e) => setApplyLeaveForm(prev => ({ ...prev, leaveType: e.target.value })),
                  }, [
                    h('option', { value: 'PH' }, 'PH (Public Holiday)'),
                    h('option', { value: 'Annual' }, 'Annual Leave'),
                    h('option', { value: 'Sick' }, 'Sick Leave'),
                    h('option', { value: 'Emergency' }, 'Emergency Leave'),
                    h('option', { value: 'Other' }, 'Other'),
                  ]),
                ]),
                h('label', { className: 'field' }, [
                  'Start Date',
                  h('input', {
                    type: 'date',
                    value: applyLeaveForm.startDate,
                    onChange: (e) => setApplyLeaveForm(prev => ({ ...prev, startDate: e.target.value })),
                  }),
                ]),
                h('label', { className: 'field' }, [
                  'End Date',
                  h('input', {
                    type: 'date',
                    value: applyLeaveForm.endDate,
                    onChange: (e) => setApplyLeaveForm(prev => ({ ...prev, endDate: e.target.value })),
                  }),
                ]),
                h('label', { className: 'field' }, [
                  'Reason',
                  h('textarea', {
                    rows: 3,
                    value: applyLeaveForm.reason,
                    onChange: (e) => setApplyLeaveForm(prev => ({ ...prev, reason: e.target.value })),
                    placeholder: 'Reason for the leave...',
                  }),
                ]),
                h('label', { className: 'field' }, [
                  'Auto Approve',
                  h('select', {
                    value: applyLeaveForm.autoApprove,
                    onChange: (e) => setApplyLeaveForm(prev => ({ ...prev, autoApprove: e.target.value === 'true' })),
                  }, [
                    h('option', { value: 'true' }, 'Yes - Auto approve (skip approval flow)'),
                    h('option', { value: 'false' }, 'No - Send for manager approval'),
                  ]),
                ]),
              ]),
              h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [
                h('button', {
                  className: 'btn primary',
                  onClick: applyLeaveOnBehalf,
                  disabled: applyLeaveBusy || !applyLeaveForm.startDate || !applyLeaveForm.endDate || !applyLeaveForm.reason,
                }, applyLeaveBusy ? 'Applying...' : 'Apply Leave on Behalf'),
                h('button', {
                  className: 'btn secondary',
                  onClick: () => {
                    setApplyLeaveSelectedEmp(null);
                    setApplyLeaveSearch('');
                    setApplyLeaveResults([]);
                    setApplyLeaveForm({ employeeId: '', leaveType: 'PH', startDate: '', endDate: '', reason: '', autoApprove: true });
                  },
                }, 'Clear'),
              ]),
            ]),
          ]),
          adminPage === 'team' && !selectedEmployeeDetails && h('div', { className: 'admin-grid-single' }, [
            h('div', { className: 'card' }, [
              h('div', { className: 'directory-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'People'),
                  h('h2', null, 'Team directory'),
                  h('p', { className: 'muted' }, `${filteredEmployees.length} of ${employees.length} employees shown`),
                ]),
                h('div', { className: 'directory-controls' }, [
                  h('input', {
                    value: employeeSearch,
                    onChange: (event) => {
                      setEmployeeSearch(event.target.value);
                      setAdminTeamPage(1);
                    },
                    placeholder: 'Search name, ID, email, role',
                  }),
                  h('select', {
                    value: roleFilter,
                    onChange: (event) => {
                      setRoleFilter(event.target.value);
                      setAdminTeamPage(1);
                    },
                  }, [
                    h('option', { value: 'all' }, 'All roles'),
                    h('option', { value: 'admin' }, 'Admin'),
                    h('option', { value: 'restaurant-manager' }, 'Restaurant manager'),
                    h('option', { value: 'company-manager' }, 'Company manager'),
                    h('option', { value: 'employee' }, 'Employee'),
                  ]),
                ]),
              ]),
              (function() {
                const ITEMS_PER_PAGE = 10;
                const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE));
                const safePage = Math.min(adminTeamPage, totalPages);
                const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
                const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredEmployees.length);
                const pageEmployees = filteredEmployees.slice(startIdx, endIdx);
                const slideId = 'team-slide-' + safePage;
                const prevDisabled = safePage <= 1;
                const nextDisabled = safePage >= totalPages;
                return h('div', { className: 'team-directory-slider' }, [
                  h('div', { className: 'team-slide-container', key: slideId }, [
                    pageEmployees.length ? pageEmployees.map((emp) => {
                      const photoInputId = `photo-input-${emp.employeeId || emp.id}`;
                      return h('div', { key: emp.id, className: 'doc-item employee-row slide-item' }, [
                        h('div', { className: 'employee-info' }, [
                          emp.photoUrl
                            ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name || 'Employee photo' })
                            : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                          h('div', { className: 'employee-meta' }, [
                            h('div', { className: 'employee-name-line' }, [
                              h('strong', null, emp.name || 'Unnamed employee'),
                              h('span', { className: 'employee-id-pill' }, emp.employeeId || 'Missing ID'),
                              h('span', { className: `employee-role-pill role-${emp.role || 'employee'}` }, formatRole(emp.role)),
                            ]),
                            h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'} | ${formatMoney(emp.salary)}`),
                            h('p', { className: 'muted employee-shift-note' }, emp.shiftRoster?.shiftName ? `${emp.shiftRoster.shiftName} ${emp.shiftRoster.startTime || ''}-${emp.shiftRoster.endTime || ''}` : 'Shift unassigned'),
                          ]),
                        ]),
                        h('div', { className: 'employee-row-actions' }, [
                          h('input', {
                            id: photoInputId,
                            type: 'file',
                            accept: 'image/*',
                            style: { display: 'none' },
                            onChange: (e) => {
                              const f = e.target.files && e.target.files[0];
                              if (f) uploadEmployeeRowPhoto(emp.employeeId, f);
                              e.target.value = '';
                            },
                          }),
                          h('button', {
                            className: 'btn primary small',
                            onClick: () => loadEmployeeDetails(emp.employeeId),
                            disabled: !emp.employeeId,
                            title: 'View employee details',
                          }, 'Details'),
                          h('button', {
                            className: 'btn secondary small',
                            onClick: () => prepareEmployeeEdit(emp),
                            disabled: !emp.employeeId,
                            title: 'Edit employee',
                          }, 'Edit'),
                          h('button', {
                            className: 'btn white small',
                            onClick: () => {
                              const input = document.getElementById(photoInputId);
                              if (input) input.click();
                            },
                            disabled: !emp.employeeId,
                            title: 'Change employee photo',
                          }, 'Photo'),
                          h('button', {
                            className: 'btn red small',
                            onClick: () => deleteEmployee(emp.employeeId),
                            disabled: !emp.employeeId,
                            title: 'Remove employee',
                          }, 'Remove'),
                        ]),
                      ]);
                    }) : h(EmptyState, {
                      title: 'No matching employees',
                      message: 'Try a different search term or role filter.',
                      actionLabel: 'Clear filters',
                      onAction: () => {
                        setEmployeeSearch('');
                        setRoleFilter('all');
                      },
                    }),
                  ]),
                  totalPages > 1 && h('div', { className: 'slide-pagination' }, [
                    h('button', {
                      className: 'slide-nav-btn',
                      onClick: () => setAdminTeamPage(Math.max(1, safePage - 1)),
                      disabled: prevDisabled,
                      title: 'Previous page',
                    }, '‹'),
                    h('div', { className: 'slide-page-info' },
                      Array.from({ length: totalPages }, (_, i) => h('span', {
                        key: i,
                        className: 'slide-dot' + (i + 1 === safePage ? ' active' : ''),
                        onClick: () => setAdminTeamPage(i + 1),
                      }, String(i + 1)))
                    ),
                    h('button', {
                      className: 'slide-nav-btn',
                      onClick: () => setAdminTeamPage(Math.min(totalPages, safePage + 1)),
                      disabled: nextDisabled,
                      title: 'Next page',
                    }, '›'),
                  ]),
                  h('div', { className: 'slide-footer-info' },
                    filteredEmployees.length > 0
                      ? `Showing ${startIdx + 1}-${endIdx} of ${filteredEmployees.length} employees`
                      : 'No employees match your filters'
                  ),
                ]);
              })(),
            ]),
          ]),
          adminPage === 'team' && selectedEmployeeDetails && h('div', { className: 'emp-profile-page' }, [
            h('div', { className: 'back-bar' }, [
              h('button', { className: 'btn white small', onClick: () => { setSelectedEmployeeDetails(null); setSelectedEmployeeId(''); setEditEmployeeId(null); resetEmployeeForm(); } }, '← Back to Directory'),
              h('span', { className: 'badge' }, selectedEmployeeDetails.name || selectedEmployeeDetails.employeeId),
            ]),
            h('div', { className: 'emp-profile-content' }, [
              h('div', { className: 'card emp-profile-main' }, [
                h('div', { className: 'profile-card-header' }, [
                  selectedEmployeeDetails.photoUrl ? h('img', { src: selectedEmployeeDetails.photoUrl, className: 'employee-avatar large', alt: selectedEmployeeDetails.name || 'Employee photo' }) : h('div', { className: 'employee-avatar placeholder large' }, initialsFrom(selectedEmployeeDetails.name)),
                  h('div', { className: 'profile-card-title' }, [
                    h('p', { className: 'eyebrow' }, 'Employee details'),
                    h('h2', null, selectedEmployeeDetails.name || selectedEmployeeDetails.employeeId),
                    h('p', { className: 'muted' }, `${selectedEmployeeDetails.employeeId} | ${formatRole(selectedEmployeeDetails.role)}`),
                  ]),
                ]),
                h('div', { className: 'profile-detail-grid' }, [
                  h('div', null, [h('p', { className: 'detail-label' }, 'Employee ID'), h('p', null, selectedEmployeeDetails.employeeId)]),
                  h('div', null, [h('p', { className: 'detail-label' }, 'Email'), h('p', null, selectedEmployeeDetails.email || '—')]),
                  h('div', null, [h('p', { className: 'detail-label' }, 'Designation'), h('p', null, selectedEmployeeDetails.designation || '—')]),
                  h('div', null, [h('p', { className: 'detail-label' }, 'Role'), h('p', null, selectedEmployeeDetails.role)]),
                  h('div', null, [h('p', { className: 'detail-label' }, 'Salary'), h('p', null, `AED ${selectedEmployeeDetails.salary || 0}`)]),
                  h('div', null, [h('p', { className: 'detail-label' }, 'Joined'), h('p', null, new Date(selectedEmployeeDetails.createdAt).toLocaleString())]),
                ]),
                h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [h('button', { className: 'btn primary small', onClick: () => prepareEmployeeEdit(selectedEmployeeDetails) }, 'Edit Employee')]),
              ]),
              h('div', { className: 'card' }, [
                h('h2', null, 'Employee management'),
                h('div', { className: 'form-grid' }, [
                  ['employeeId','name','email','designation','salary','password','role'].map((field) => h('label', { className: 'field', key: field }, [
                    field === 'role' ? 'Role' : field.charAt(0).toUpperCase() + field.slice(1),
                    field === 'role'
                      ? h('select', { value: newEmployee.role, onChange: (e) => setNewEmployee((prev) => ({ ...prev, role: e.target.value })) }, [
                          h('option', { value: 'employee' }, 'Employee'),
                          h('option', { value: 'restaurant-manager' }, 'Restaurant Manager'),
                          h('option', { value: 'company-manager' }, 'Company Manager'),
                          h('option', { value: 'admin' }, 'Admin'),
                        ])
                      : h('input', {
                          type: field === 'password' ? 'password' : 'text',
                          value: newEmployee[field],
                          onChange: (e) => setNewEmployee((prev) => ({ ...prev, [field]: e.target.value })),
                          placeholder: field === 'employeeId' ? 'E002' : field.charAt(0).toUpperCase() + field.slice(1),
                          disabled: editEmployeeId && field === 'employeeId',
                        }),
                    field === 'password' && h('p', { className: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'Password must be 12+ chars with uppercase, lowercase, numbers, and symbols.'),
                  ])),
                ]),
                h('label', { className: 'field' }, ['Photo (passport)', h('input', { type: 'file', accept: 'image/*', onChange: (e) => setEmployeePhotoFile(e.target.files[0]), disabled: !editEmployeeId })]),
                h('div', { className: 'form-actions' }, [
                  h('button', { className: 'btn primary', onClick: saveEmployee }, editEmployeeId ? 'Save changes' : 'Create employee'),
                  editEmployeeId && h('button', { className: 'btn secondary', onClick: resetEmployeeForm }, 'Cancel'),
                ]),
              ]),
              h('div', { className: 'card' }, [
                h('h3', null, 'Shift roster'),
                h('div', { className: 'doc-item shift-item' }, [
                  h('div', null, [h('strong', null, selectedEmployeeDetails.shiftRoster?.shiftName || 'General shift'), h('p', { className: 'muted' }, `From ${selectedEmployeeDetails.shiftRoster?.startTime || '09:00'} to ${selectedEmployeeDetails.shiftRoster?.endTime || '18:00'}`), h('p', { className: 'muted' }, selectedEmployeeDetails.shiftRoster?.notes || 'No shift notes.')]),
              h('button', { className: 'btn secondary small', onClick: () => { setAdminPage('assignShift'); setTab('admin'); } }, 'Edit Shift'),
                        h('button', { className: 'btn red small', onClick: async () => {
                          if (!window.confirm('Remove shift for ' + selectedEmployeeDetails.name + '?')) return;
                          try {
                            await apiRequest('/api/employees/' + selectedEmployeeDetails.employeeId + '/shift', token, { method: 'PUT', body: JSON.stringify({ shiftRoster: {} }) });
                            await loadEmployeeDetails(selectedEmployeeDetails.employeeId);
                            setMessage('Shift removed successfully');
                          } catch (err) { setMessage(err.error || 'Failed to remove shift'); }
                        } }, 'Remove Shift'),
                ]),
              ]),
              h('div', { className: 'card' }, [
                h('h3', null, 'Documents'),
                selectedEmployeeDetails.documents && selectedEmployeeDetails.documents.length
                  ? selectedEmployeeDetails.documents.map((doc, index) => h('div', { key: index, className: 'doc-item' }, [h('div', null, [h('a', { href: doc.url, target: '_blank' }, doc.originalname), h('p', { className: 'muted' }, `${doc.docType || 'General'} · ${doc.description || 'No details'} · Uploaded ${new Date(doc.uploadedAt).toLocaleString()}`)])]))
                  : h('p', { className: 'muted' }, 'No documents uploaded yet.'),
                h('div', { className: 'upload-row' }, [
                  h('label', { className: 'field' }, ['Type', h('input', { type: 'text', value: employeeDocMeta.docType, onChange: (event) => setEmployeeDocMeta((prev) => ({ ...prev, docType: event.target.value })), placeholder: 'Contract, ID, Payslip' })]),
                  h('label', { className: 'field' }, ['Issue date', h('input', { type: 'date', value: employeeDocMeta.issueDate, onChange: (event) => setEmployeeDocMeta((prev) => ({ ...prev, issueDate: event.target.value })) })]),
                  h('label', { className: 'field' }, ['Notes', h('input', { type: 'text', value: employeeDocMeta.description, onChange: (event) => setEmployeeDocMeta((prev) => ({ ...prev, description: event.target.value })), placeholder: 'Optional notes' })]),
                  h('input', { type: 'file', onChange: (event) => setEmployeeDocFile(event.target.files[0]) }),
                ]),
                h('button', { className: 'btn primary', onClick: uploadEmployeeDocument }, 'Add document'),
              ]),
              // Manual attendance moved to admin section
              h('div', { className: 'card' }, [
                h('h3', null, 'Assets'),
                selectedEmployeeDetails.assets && selectedEmployeeDetails.assets.length
                  ? selectedEmployeeDetails.assets.map((asset) => {
                      const historyCount = (asset.assignmentHistory || []).length;
                      return h('div', { key: asset.id, className: 'doc-item asset-item' }, [
                        h('div', null, [
                          h('strong', null, `${asset.name} (${asset.assetType || asset.assetTag || 'Asset'})`),
                          h('p', { className: 'muted' }, `SN: ${asset.serialNumber || '—'} · Model: ${asset.model || '—'}`),
                          h('p', { className: 'muted' }, asset.description || 'No description provided.'),
                          h('p', { className: 'muted', style: { fontSize: '11px', marginTop: '4px', color: 'var(--accent)' } },
                            asset.assignedBy ? `Assigned by: ${asset.assignedBy} (${asset.assignedById}) · ${asset.assignedAt ? new Date(asset.assignedAt).toLocaleString() : ''}` : ''
                          ),
                          historyCount > 0 && h('div', { style: { marginTop: '6px', fontSize: '11px', borderTop: '1px dashed var(--border)', paddingTop: '4px' } }, [
                            h('span', { style: { fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' } }, 'Assignment History:'),
                            asset.assignmentHistory.map((h, idx) => h('p', { key: idx, style: { margin: '1px 0', color: 'var(--text-muted)' } },
                              `${h.action} by ${h.by} (${h.byId}) at ${new Date(h.at).toLocaleString()}${h.notes ? ' · ' + h.notes : ''}`
                            )),
                          ]),
                        ]),
                        h('div', { className: 'asset-meta' }, [
                          h('p', { className: 'muted' }, `Status: ${asset.status}`),
                          asset.assignedAt && h('p', { className: 'muted' }, `Assigned ${new Date(asset.assignedAt).toLocaleString()}`),
                        ]),
                      ]);
                    })
                  : h('p', { className: 'muted' }, 'No assets assigned.'),
                // Add Asset button
                h('div', { style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' } }, [
                  !profileAssetForm.showForm
                    ? h('button', { className: 'btn primary small', onClick: () => setProfileAssetForm(prev => ({ ...prev, showForm: true })) }, '➕ Add Asset')
                    : h('div', { className: 'form-grid', style: { marginTop: '8px' } }, [
                        h('label', { className: 'field' }, ['Name', h('input', { value: profileAssetForm.name, onChange: (e) => setProfileAssetForm(prev => ({ ...prev, name: e.target.value })), placeholder: 'Asset name' })]),
                        h('label', { className: 'field' }, ['Serial No', h('input', { value: profileAssetForm.serialNumber, onChange: (e) => setProfileAssetForm(prev => ({ ...prev, serialNumber: e.target.value })), placeholder: 'Serial number' })]),
                        h('label', { className: 'field' }, ['Type', h('input', { value: profileAssetForm.assetType, onChange: (e) => setProfileAssetForm(prev => ({ ...prev, assetType: e.target.value })), placeholder: 'Laptop, Phone...' })]),
                        h('label', { className: 'field' }, ['Model', h('input', { value: profileAssetForm.model, onChange: (e) => setProfileAssetForm(prev => ({ ...prev, model: e.target.value })), placeholder: 'Model' })]),
                        h('label', { className: 'field', style: { gridColumn: 'span 2' } }, ['Description', h('input', { value: profileAssetForm.description, onChange: (e) => setProfileAssetForm(prev => ({ ...prev, description: e.target.value })), placeholder: 'Optional notes' })]),
                        h('div', { className: 'form-actions', style: { gridColumn: 'span 2' } }, [
                          h('button', { className: 'btn primary', onClick: assignProfileAsset, disabled: profileAssetBusy || !profileAssetForm.name || !profileAssetForm.serialNumber || !profileAssetForm.assetType }, profileAssetBusy ? 'Assigning...' : 'Assign Asset'),
                          h('button', { className: 'btn secondary', onClick: () => setProfileAssetForm({ showForm: false, name: '', serialNumber: '', assetType: '', model: '', description: '' }) }, 'Cancel'),
                        ]),
                      ]),
                ]),
              ]),
            ]),
          ]),

            adminPage === 'bulkUpload' && h('div', { className: 'card bulk-upload-hero admin-section-card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, '📦 Bulk Upload'),
                  h('h2', null, ['🚀 ', 'Import Employees']),
                  h('p', { className: 'muted' }, 'Upload an Excel file, CSV, or PDF containing employee records. Download a template below.'),
                ]),
              ]),
              h('div', { className: 'bulk-template-buttons', style: { marginBottom: '20px' } }, [
                h('button', { className: 'btn secondary small', onClick: () => downloadBulkTemplate(), disabled: bulkDownloadBusy }, bulkDownloadBusy ? '⏳ Downloading...' : '📥 Download Excel Template'),
                h('button', { className: 'btn secondary small', onClick: () => downloadBulkPdfTemplate(), disabled: bulkDownloadBusy }, bulkDownloadBusy ? '⏳ Downloading...' : '📥 Download PDF Template'),
              ]),
              h('div', { className: `bulk-upload-dropzone ${bulkFile ? 'has-file' : ''}` }, [
                h('span', { className: 'dropzone-icon' }, bulkFile ? '✅' : '📂'),
                h('p', { style: { fontWeight: 600 } }, bulkFile ? bulkFile.name : 'Click to select file or drag & drop'),
                h('p', { className: 'muted', style: { fontSize: '12px' } }, 'Supports: .xlsx, .xls, .csv, .pdf'),
                h('input', {
                  type: 'file',
                  accept: '.xlsx,.xls,.csv,.pdf',
                  style: { display: 'none' },
                  id: 'bulk-file-input',
                  onChange: (e) => setBulkFile(e.target.files && e.target.files[0]),
                }),
                h('button', { className: 'btn secondary small', style: { marginTop: '12px' }, onClick: () => document.getElementById('bulk-file-input').click() }, '📁 Browse Files'),
              ]),

              h('div', { className: 'bulk-ph-section', style: { marginTop: '20px', padding: '16px', borderRadius: '16px', background: 'var(--card-bg)' } }, [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } }, [
                  h('div', null, [h('strong', null, 'Bulk paid holiday upload'), h('p', { className: 'muted' }, 'Upload employee paid holiday balances in Excel or CSV format.')]),
                  h('button', { className: 'btn secondary small', onClick: downloadBulkPhTemplate, disabled: bulkPhBusy }, bulkPhBusy ? '⏳ Downloading...' : '📥 Download PH Template'),
                ]),
                h('div', { style: { marginTop: '12px' } }, [
                  h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' }, id: 'bulk-ph-file-input', onChange: (e) => setBulkPhFile(e.target.files && e.target.files[0]) }),
                  h('button', { className: 'btn secondary small', onClick: () => document.getElementById('bulk-ph-file-input').click() }, '📁 Browse PH File'),
                  h('button', { className: 'btn primary small', style: { marginLeft: '8px' }, onClick: uploadBulkPh, disabled: bulkPhBusy || !bulkPhFile }, bulkPhBusy ? '⏳ Uploading...' : '🚀 Upload PHs'),
                  bulkPhFile && h('span', { style: { marginLeft: '8px' } }, bulkPhFile.name),
                ]),
              ]),

              h('div', { className: 'bulk-ph-section', style: { marginTop: '20px', padding: '16px', borderRadius: '16px', background: 'var(--card-bg)' } }, [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } }, [
                  h('div', null, [h('strong', null, 'Bulk annual leave upload'), h('p', { className: 'muted' }, 'Upload employee annual leave entitlements in Excel or CSV format.')]),
                  h('button', { className: 'btn secondary small', onClick: downloadBulkAnnualLeaveTemplate, disabled: bulkAnnualLeaveBusy }, bulkAnnualLeaveBusy ? '⏳ Downloading...' : '📥 Download Annual Leave Template'),
                ]),
                h('div', { style: { marginTop: '12px' } }, [
                  h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' }, id: 'bulk-annual-leave-file-input', onChange: (e) => setBulkAnnualLeaveFile(e.target.files && e.target.files[0]) }),
                  h('button', { className: 'btn secondary small', onClick: () => document.getElementById('bulk-annual-leave-file-input').click() }, '📁 Browse Annual Leave File'),
                  h('button', { className: 'btn primary small', style: { marginLeft: '8px' }, onClick: uploadBulkAnnualLeave, disabled: bulkAnnualLeaveBusy || !bulkAnnualLeaveFile }, bulkAnnualLeaveBusy ? '⏳ Uploading...' : '🚀 Upload Annual Leaves'),
                  bulkAnnualLeaveFile && h('span', { style: { marginLeft: '8px' } }, bulkAnnualLeaveFile.name),
                ]),
              ]),

              h('div', { className: 'bulk-photo-section', style: { marginTop: '20px', padding: '16px', borderRadius: '16px', background: 'var(--card-bg)' } }, [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } }, [
                  h('div', null, [h('strong', null, 'Bulk photo upload'), h('p', { className: 'muted' }, 'Select a folder containing employee photos. Use the sample template to match file names to employee IDs.')]),
                  h('button', { className: 'btn secondary small', onClick: downloadBulkPhotoTemplate, disabled: bulkPhotoBusy }, bulkPhotoBusy ? '⏳ Downloading...' : '📥 Download Photo Template'),
                ]),
                h('div', { className: 'bulk-upload-dropzone', style: { marginTop: '12px' } }, [
                  h('span', { className: 'dropzone-icon' }, bulkPhotoFiles.length > 0 ? '🖼️' : '📁'),
                  h('p', { style: { fontWeight: 600 } }, bulkPhotoFiles.length > 0 ? `${bulkPhotoFiles.length} file(s) selected` : 'Select photo folder'),
                  h('input', {
                    type: 'file',
                    webkitdirectory: true,
                    multiple: true,
                    style: { display: 'none' },
                    id: 'bulk-photo-input',
                    onChange: (e) => setBulkPhotoFiles(Array.from(e.target.files || [])),
                  }),
                  h('button', { className: 'btn secondary small', style: { marginTop: '12px' }, onClick: () => document.getElementById('bulk-photo-input').click() }, '📁 Browse Folder'),
                ]),
                h('div', { className: 'form-actions', style: { marginTop: '12px' } }, [
                  h('button', { className: 'btn primary', onClick: uploadBulkPhotos, disabled: bulkPhotoBusy || !bulkPhotoFiles.length }, bulkPhotoBusy ? '⏳ Uploading...' : '📤 Upload Photos'),
                ]),
                bulkPhotoResult && h('div', { className: 'bulk-result-card', style: { marginTop: '12px', padding: '16px', borderRadius: '12px' } }, [
                  h('p', { style: { fontWeight: 600 } }, `✅ Matched: ${bulkPhotoResult.matchedCount || 0} | ⏭️ Skipped: ${bulkPhotoResult.skippedCount || 0}`),
                ]),
              ]),

              // Bulk Asset Upload Section
              h('div', { className: 'bulk-ph-section', style: { marginTop: '20px', padding: '16px', borderRadius: '16px', background: 'var(--card-bg)' } }, [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' } }, [
                  h('div', null, [h('strong', null, '📦 Bulk Asset Upload'), h('p', { className: 'muted' }, 'Upload an Excel file with asset details. Columns: employeeId, name, serialNumber, assetType, model, description, price')]),
                  h('button', { className: 'btn secondary small', onClick: async () => {
                    if (!token) return setMessage('Authentication required');
                    try {
                      const response = await fetch('/api/company/assets/template', { headers: { 'Authorization': 'Bearer ' + token } });
                      if (!response.ok) { const err = await response.json(); throw err; }
                      const blob = await response.blob();
                      downloadBlob(blob, 'asset_bulk_upload_template.xlsx');
                      setMessage('📥 Asset template downloaded!');
                    } catch (err) { setMessage(err.error || 'Download failed'); }
                  } }, '📥 Download Asset Template'),
                ]),
                h('div', { style: { marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, [
                  h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' }, id: 'bulk-asset-file-input', onChange: (e) => setBulkAssetFile(e.target.files && e.target.files[0]) }),
                  h('button', { className: 'btn secondary small', onClick: () => document.getElementById('bulk-asset-file-input').click() }, '📁 Browse Asset File'),
                  h('button', { className: 'btn primary small', onClick: async () => {
                    if (!bulkAssetFile) return setMessage('Select an Excel/CSV file first');
                    setBulkAssetBusy(true);
                    setBulkAssetResult(null);
                    try {
                      const form = new FormData();
                      form.append('file', bulkAssetFile);
                      const result = await apiRequest('/api/company/assets/bulk-upload', token, { method: 'POST', body: form });
                      setBulkAssetResult(result);
                      setMessage(`✅ ${result.assignedCount} assets assigned, ${result.skippedCount} skipped`);
                      setBulkAssetFile(null);
                      await loadEmployees();
                    } catch (err) { setMessage(err.error || 'Upload failed'); }
                    finally { setBulkAssetBusy(false); }
                  }, disabled: bulkAssetBusy || !bulkAssetFile }, bulkAssetBusy ? '⏳ Uploading...' : '🚀 Upload Assets'),
                  bulkAssetFile && h('span', { style: { fontSize: '13px', color: 'var(--text-muted)' } }, '📎 ' + bulkAssetFile.name),
                ]),
                bulkAssetResult && h('div', { className: 'bulk-result-card', style: { marginTop: '12px', padding: '16px', borderRadius: '12px', background: 'var(--accent-soft)' } }, [
                  h('p', { style: { fontWeight: 600 } }, `✅ ${bulkAssetResult.assignedCount} / ${bulkAssetResult.totalRows} assets assigned | ⏭️ ${bulkAssetResult.skippedCount} skipped | ❌ ${bulkAssetResult.errorCount || 0} errors`),
                  bulkAssetResult.skipped && bulkAssetResult.skipped.length > 0 && h('div', { style: { marginTop: '8px', fontSize: '12px' } },
                    bulkAssetResult.skipped.map((s, idx) => h('p', { key: idx, style: { color: '#c62828' } }, `Row ${s.row}: ${s.reason}`))
                  ),
                  bulkAssetResult.assigned && bulkAssetResult.assigned.length > 0 && h('div', { style: { marginTop: '8px', fontSize: '12px' } },
                    bulkAssetResult.assigned.slice(0, 5).map((a, idx) => h('p', { key: idx, style: { color: '#2e7d32' } }, `${a.employeeId} ${a.name} → ${a.asset} (${a.serialNumber})`))
                  ),
                  bulkAssetResult.assigned && bulkAssetResult.assigned.length > 5 && h('p', { className: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, `...and ${bulkAssetResult.assigned.length - 5} more`),
                ]),
              ]),

              h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [
                h('button', { className: 'btn primary', onClick: uploadBulkEmployees, disabled: bulkBusy || !bulkFile }, bulkBusy ? '⏳ Uploading...' : '🚀 Upload & Create Employees'),
              ]),
              bulkResult && h('div', { className: 'bulk-result-card', style: { marginTop: '16px', padding: '20px', borderRadius: '16px' } }, [
                h('div', { className: 'stats-grid', style: { marginBottom: '12px' } }, [
                  h(StatTile, { label: '✅ Created', value: bulkResult.createdCount || 0, variant: bulkResult.createdCount > 0 ? 'white' : 'light' }),
                  h(StatTile, { label: '⚠️ Skipped', value: bulkResult.skippedCount || 0, variant: bulkResult.skippedCount > 0 ? 'red' : 'light' }),
                  h(StatTile, { label: '📊 Total', value: bulkResult.totalRows || 0, variant: 'light' }),
                ]),
                bulkCredentials.length > 0 && h('div', { style: { marginBottom: '12px' } }, [
                  h('p', { style: { fontWeight: 600, marginBottom: '8px' } }, '🔑 Generated Credentials'),
                  h('div', { className: 'bulk-credential-list' },
                    bulkCredentials.map((c, idx) => h('div', { key: idx, className: 'bulk-credential-item' }, [
                      h('span', { style: { fontWeight: 500 } }, c.employeeId),
                      h('span', { style: { color: 'var(--accent)', fontFamily: 'monospace' } }, c.password),
                    ]))
                  ),
                  h('button', { className: 'btn secondary small', style: { marginTop: '8px' }, onClick: () => downloadBulkCredentials() }, '📥 Download Credentials CSV'),
                ]),
                (bulkResult.skipped || []).length > 0 && h('div', { style: { marginTop: '12px' } }, [
                  h('p', { style: { fontWeight: 500, marginBottom: '4px' } }, 'Skipped rows:'),
                  h('div', { className: 'bulk-skipped-list' },
                    bulkResult.skipped.map((s, idx) => h('div', { key: idx }, `Row ${s.rowNumber}: ${s.employeeId} - ${s.reason}`))
                  ),
                ]),
              ]),
            ]),
            adminPage === 'assignAsset' && h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Assign Asset'),
                  h('h2', null, 'Assign Asset to Employee'),
                  h('p', { className: 'muted' }, 'Select an employee and fill out the asset details to assign.'),
                ]),
              ]),
              h('label', { className: 'field' }, [
                'Employee',
                h('select', {
                  value: selectedEmployeeId,
                  onChange: (event) => {
                    setSelectedEmployeeId(event.target.value);
                    if (event.target.value) loadEmployeeDetails(event.target.value);
                  },
                }, [
                  h('option', { value: '' }, 'Select employee'),
                  employees.map((emp) => h('option', { key: emp.id, value: emp.employeeId }, `${emp.name} (${emp.employeeId})`)),
                ]),
              ]),
              selectedEmployeeId && h('div', { className: 'form-grid' }, [
                h('label', { className: 'field' }, ['Asset name', h('input', { value: newAsset.name, onChange: (e) => setNewAsset(prev => ({ ...prev, name: e.target.value })), placeholder: 'e.g. Laptop' })]),
                h('label', { className: 'field' }, ['Serial number', h('input', { value: newAsset.serialNumber, onChange: (e) => setNewAsset(prev => ({ ...prev, serialNumber: e.target.value })), placeholder: 'e.g. SN-2024-001' })]),
                h('label', { className: 'field' }, ['Asset type', h('input', { value: newAsset.assetType, onChange: (e) => setNewAsset(prev => ({ ...prev, assetType: e.target.value })), placeholder: 'e.g. Electronics' })]),
                h('label', { className: 'field' }, ['Model', h('input', { value: newAsset.model, onChange: (e) => setNewAsset(prev => ({ ...prev, model: e.target.value })), placeholder: 'e.g. Dell XPS 15' })]),
                h('label', { className: 'field' }, ['Description', h('input', { value: newAsset.description, onChange: (e) => setNewAsset(prev => ({ ...prev, description: e.target.value })), placeholder: 'Optional notes' })]),
              ]),
              h('div', { className: 'form-actions' }, [
                h('button', { className: 'btn primary', onClick: assignAsset, disabled: !selectedEmployeeId || !newAsset.name || !newAsset.serialNumber || !newAsset.assetType }, 'Assign Asset'),
              ]),
              selectedEmployeeDetails && selectedEmployeeDetails.assets && selectedEmployeeDetails.assets.length > 0 && h('div', { style: { marginTop: '24px' } }, [
                h('h3', null, 'Current Assets'),
                selectedEmployeeDetails.assets.map((asset) => h('div', { key: asset.id, className: 'doc-item asset-item' }, [
                  h('div', null, [h('strong', null, `${asset.name} (${asset.assetType || asset.assetTag || 'Asset'})`), h('p', { className: 'muted' }, `SN: ${asset.serialNumber || '—'} | Model: ${asset.model || '—'} | Status: ${asset.status || 'assigned'}`)]),
                  h('div', { className: 'asset-meta' }, [h('p', { className: 'muted' }, `Assigned ${new Date(asset.assignedAt).toLocaleString()}`)]),
                ])),
              ]),
            ]),

            adminPage === 'assignShift' && h('div', { className: 'card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, 'Shift Roster'),
                  h('h2', null, 'Assign Shift to Employee'),
                  h('p', { className: 'muted' }, 'Select an employee and manage their shift schedule.'),
                ]),
              ]),
              h('label', { className: 'field' }, [
                'Employee',
                h('select', {
                  value: selectedEmployeeId,
                  onChange: (event) => {
                    setSelectedEmployeeId(event.target.value);
                    if (event.target.value) loadEmployeeDetails(event.target.value);
                  },
                }, [
                  h('option', { value: '' }, 'Select employee'),
                  employees.map((emp) => h('option', { key: emp.id, value: emp.employeeId }, `${emp.name} (${emp.employeeId})`)),
                ]),
              ]),
              selectedEmployeeId && h('div', { className: 'form-grid' }, [
                h('label', { className: 'field' }, ['Shift name', h('input', { value: employeeShift.shiftName, onChange: (e) => setEmployeeShift(prev => ({ ...prev, shiftName: e.target.value })), placeholder: 'e.g. Morning Shift' })]),
                h('label', { className: 'field' }, ['Start time', h('input', { type: 'time', value: employeeShift.startTime, onChange: (e) => setEmployeeShift(prev => ({ ...prev, startTime: e.target.value })) })]),
                h('label', { className: 'field' }, ['End time', h('input', { type: 'time', value: employeeShift.endTime, onChange: (e) => setEmployeeShift(prev => ({ ...prev, endTime: e.target.value })) })]),
                h('label', { className: 'field' }, ['Notes', h('textarea', { value: employeeShift.notes, onChange: (e) => setEmployeeShift(prev => ({ ...prev, notes: e.target.value })), rows: 3, placeholder: 'Additional shift notes' })]),
              ]),
              h('div', { className: 'form-actions' }, [
                h('button', { className: 'btn primary', onClick: updateShift, disabled: !selectedEmployeeId }, 'Save Shift'),
              ]),
              selectedEmployeeDetails && selectedEmployeeDetails.shiftRoster && selectedEmployeeDetails.shiftRoster.shiftName && h('div', { className: 'doc-item shift-item', style: { marginTop: '16px' } }, [
                h('div', null, [
                  h('strong', null, selectedEmployeeDetails.shiftRoster.shiftName),
                  h('p', { className: 'muted' }, `${selectedEmployeeDetails.shiftRoster.startTime || '—'} to ${selectedEmployeeDetails.shiftRoster.endTime || '—'}`),
                  selectedEmployeeDetails.shiftRoster.notes && h('p', { className: 'muted' }, selectedEmployeeDetails.shiftRoster.notes),
                ]),
              ]),
            ]),

            adminPage === 'zkteco' && h('div', { className: 'zkteco-shell' }, [
              // Controls
              h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' } }, [
                h('button', { className: `btn ${zktecoPage === 'list' ? 'primary' : 'secondary'} small`, onClick: () => setZktecoPage('list') }, 'Device List'),
                h('button', { className: `btn ${zktecoPage === 'add' ? 'primary' : 'secondary'} small`, onClick: () => setZktecoPage('add') }, 'Add Device'),
                h('button', { className: 'btn secondary small', onClick: syncAllDevices, disabled: zktecoSyncing }, zktecoSyncing ? 'Syncing...' : 'Sync All'),
                h('button', { className: 'btn secondary small', onClick: loadZktecoSyncLogs }, 'View Sync Logs'),
              ]),

              // Device List View
              zktecoPage === 'list' && h('div', null, [
                zktecoDevices.length === 0
                  ? h(EmptyState, { title: 'No devices registered', message: 'Add a ZKTeco device to start syncing attendance.', actionLabel: 'Add Device', onAction: () => setZktecoPage('add') })
                  : h('div', { className: 'zkteco-device-grid' },
                      zktecoDevices.map((device) => h('div', { key: device.id, className: 'zkteco-device-card' }, [
                        h('div', { className: 'zkteco-device-header' }, [
                          h('div', null, [
                            h('span', { className: 'zkteco-device-name' }, device.name || device.ipAddress),
                            h('span', { className: 'zkteco-device-ip' }, `${device.ipAddress}:${device.port || 4370}`),
                          ]),
                          h('span', { className: `badge ${device.isActive !== false ? 'badge-success' : 'badge-rejected'} small` }, device.isActive !== false ? 'Active' : 'Inactive'),
                        ]),
                        device.location && h('p', { className: 'muted' }, `📍 ${device.location}${device.outletName ? ' · ' + device.outletName : ''}`),
                        device.serialNumber && h('p', { className: 'muted' }, `SN: ${device.serialNumber}`),
                        device.lastSyncAt && h('p', { className: 'muted' }, `Last sync: ${new Date(device.lastSyncAt).toLocaleString()}`),
                        device.autoSync && h('p', { className: 'muted' }, `Auto sync: every ${device.syncInterval || 5} min`),
                        h('div', { className: 'zkteco-device-actions' }, [
                          h('button', { className: 'btn primary small', onClick: () => { setZktecoSelectedDevice(device); syncSingleDevice(device.id); }, disabled: zktecoSyncing }, 'Sync'),
                          h('button', { className: 'btn secondary small', onClick: () => { setZktecoSelectedDevice(device); setZktecoPage('edit'); } }, 'Edit'),
                          h('button', { className: 'btn secondary small', onClick: () => { setZktecoSelectedDevice(device); setZktecoPage('mapping'); } }, 'Mapping'),
                          h('button', { className: 'btn secondary small', onClick: () => { setZktecoSelectedDevice(device); setZktecoPage('geofence'); } }, 'Geofence'),
                          h('button', { className: 'btn white small', onClick: () => testDeviceConnection(device.id) }, 'Test'),
                          h('button', { className: 'btn red small', onClick: () => deleteZktecoDevice(device.id) }, 'Remove'),
                        ]),
                      ]))
                    ),
              ]),

              // Add Device
              zktecoPage === 'add' && h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [h('p', { className: 'eyebrow' }, 'ZKTeco'), h('h2', null, 'Register New Device')]),
                ]),
                h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, ['Device name', h('input', { value: zktecoForm.name, onChange: (e) => updateZktecoForm('name', e.target.value), placeholder: 'e.g. Main Entrance' })]),
                  h('label', { className: 'field' }, ['IP address', h('input', { value: zktecoForm.ipAddress, onChange: (e) => updateZktecoForm('ipAddress', e.target.value), placeholder: 'e.g. 192.168.1.100' })]),
                  h('label', { className: 'field' }, ['Port', h('input', { type: 'number', value: zktecoForm.port, onChange: (e) => updateZktecoForm('port', e.target.value), placeholder: '4370' })]),
                  h('label', { className: 'field' }, ['Location', h('input', { value: zktecoForm.location, onChange: (e) => updateZktecoForm('location', e.target.value), placeholder: 'e.g. Lobby' })]),
                  h('label', { className: 'field' }, ['Outlet name', h('input', { value: zktecoForm.outletName, onChange: (e) => updateZktecoForm('outletName', e.target.value), placeholder: 'e.g. Downtown Branch' })]),
                  h('label', { className: 'field' }, ['Serial number', h('input', { value: zktecoForm.serialNumber, onChange: (e) => updateZktecoForm('serialNumber', e.target.value), placeholder: 'Optional' })]),
                  h('label', { className: 'field' }, [
                    'Auto sync',
                    h('select', { value: zktecoForm.autoSync, onChange: (e) => updateZktecoForm('autoSync', e.target.value === 'true') }, [
                      h('option', { value: 'true' }, 'Enabled'),
                      h('option', { value: 'false' }, 'Disabled'),
                    ]),
                  ]),
                  zktecoForm.autoSync && h('label', { className: 'field' }, ['Sync interval (min)', h('input', { type: 'number', value: zktecoForm.syncInterval, onChange: (e) => updateZktecoForm('syncInterval', e.target.value), placeholder: '5' })]),
                ]),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, [
                  h('button', { className: 'btn secondary', onClick: () => testConnection(zktecoForm.ipAddress, zktecoForm.port) }, 'Test Connection'),
                  h('button', { className: 'btn primary', onClick: saveZktecoDevice, disabled: !zktecoForm.name || !zktecoForm.ipAddress }, 'Save Device'),
                  h('button', { className: 'btn white', onClick: () => setZktecoPage('list') }, 'Cancel'),
                ]),
              ]),

              // Edit Device
              zktecoPage === 'edit' && zktecoSelectedDevice && h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [h('p', { className: 'eyebrow' }, 'ZKTeco'), h('h2', null, 'Edit Device: ' + (zktecoSelectedDevice.name || zktecoSelectedDevice.ipAddress))]),
                ]),
                h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, ['Device name', h('input', { value: zktecoEditForm.name, onChange: (e) => updateZktecoEditForm('name', e.target.value) })]),
                  h('label', { className: 'field' }, ['IP address', h('input', { value: zktecoEditForm.ipAddress, onChange: (e) => updateZktecoEditForm('ipAddress', e.target.value) })]),
                  h('label', { className: 'field' }, ['Port', h('input', { type: 'number', value: zktecoEditForm.port, onChange: (e) => updateZktecoEditForm('port', e.target.value) })]),
                  h('label', { className: 'field' }, ['Location', h('input', { value: zktecoEditForm.location, onChange: (e) => updateZktecoEditForm('location', e.target.value) })]),
                  h('label', { className: 'field' }, ['Outlet name', h('input', { value: zktecoEditForm.outletName, onChange: (e) => updateZktecoEditForm('outletName', e.target.value) })]),
                  h('label', { className: 'field' }, ['Serial number', h('input', { value: zktecoEditForm.serialNumber, onChange: (e) => updateZktecoEditForm('serialNumber', e.target.value) })]),
                  h('label', { className: 'field' }, [
                    'Active',
                    h('select', { value: zktecoEditForm.isActive, onChange: (e) => updateZktecoEditForm('isActive', e.target.value === 'true') }, [
                      h('option', { value: 'true' }, 'Active'),
                      h('option', { value: 'false' }, 'Inactive'),
                    ]),
                  ]),
                ]),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, [
                  h('button', { className: 'btn primary', onClick: updateZktecoDevice }, 'Update Device'),
                  h('button', { className: 'btn white', onClick: () => setZktecoPage('list') }, 'Cancel'),
                ]),
              ]),

              // Mapping View
              zktecoPage === 'mapping' && zktecoSelectedDevice && h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'Employee Mapping'),
                    h('h2', null, 'User Mapping: ' + (zktecoSelectedDevice.name || zktecoSelectedDevice.ipAddress)),
                    h('p', { className: 'muted' }, 'Map ZKTeco user IDs to employee IDs. Format: { "zkUserId": "employeeId" }'),
                  ]),
                ]),
                h('label', { className: 'field' }, [
                  'Mapping JSON',
                  h('textarea', { value: zktecoMappingText, onChange: (e) => setZktecoMappingText(e.target.value), rows: 10, style: { fontFamily: 'monospace', fontSize: '12px' }, placeholder: '{\n  "1": "E001",\n  "2": "E002"\n}' }),
                ]),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, [
                  h('button', { className: 'btn primary', onClick: saveZktecoMapping }, 'Save Mapping'),
                  h('button', { className: 'btn white', onClick: () => setZktecoPage('list') }, 'Cancel'),
                ]),
              ]),

              // Geofence View
              zktecoPage === 'geofence' && zktecoSelectedDevice && h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'Geofence'),
                    h('h2', null, 'Geofence Settings: ' + (zktecoSelectedDevice.name || zktecoSelectedDevice.ipAddress)),
                    h('p', { className: 'muted' }, 'Configure a geofence around the device location to restrict attendance marking.'),
                  ]),
                ]),
                h('label', { className: 'field' }, [
                  'Enable geofence',
                  h('select', { value: zktecoGeofenceForm.enabled, onChange: (e) => setZktecoGeofenceForm(prev => ({ ...prev, enabled: e.target.value === 'true' })) }, [
                    h('option', { value: 'true' }, 'Enabled'),
                    h('option', { value: 'false' }, 'Disabled'),
                  ]),
                ]),
                zktecoGeofenceForm.enabled && h('div', { className: 'form-grid' }, [
                  h('label', { className: 'field' }, ['Latitude', h('input', { type: 'number', step: 'any', value: zktecoGeofenceForm.latitude, onChange: (e) => setZktecoGeofenceForm(prev => ({ ...prev, latitude: e.target.value })), placeholder: 'e.g. 25.2048' })]),
                  h('label', { className: 'field' }, ['Longitude', h('input', { type: 'number', step: 'any', value: zktecoGeofenceForm.longitude, onChange: (e) => setZktecoGeofenceForm(prev => ({ ...prev, longitude: e.target.value })), placeholder: 'e.g. 55.2708' })]),
                  h('label', { className: 'field' }, ['Radius (meters)', h('input', { type: 'number', value: zktecoGeofenceForm.radius, onChange: (e) => setZktecoGeofenceForm(prev => ({ ...prev, radius: e.target.value })), placeholder: '100' })]),
                ]),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, [
                  h('button', { className: 'btn primary', onClick: saveZktecoGeofence }, 'Save Geofence'),
                  h('button', { className: 'btn white', onClick: () => setZktecoPage('list') }, 'Cancel'),
                ]),
              ]),

              // Sync Logs
              zktecoPage === 'logs' && h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [h('p', { className: 'eyebrow' }, 'ZKTeco'), h('h2', null, 'Sync Logs'), h('p', { className: 'muted' }, 'Recent 50 sync events')]),
                ]),
                zktecoSyncLogs.length === 0
                  ? h('p', { className: 'muted' }, 'No sync logs yet.')
                  : h('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
                      zktecoSyncLogs.map((log) => h('div', { key: log.id, className: 'doc-item', style: { fontSize: '13px' } }, [
                        h('div', null, [
                          h('strong', null, log.deviceName || log.deviceId || 'Device'),
                          h('p', { className: 'muted' }, `${log.action || 'sync'} · ${new Date(log.createdAt).toLocaleString()}`),
                          log.details && h('p', { className: 'muted' }, log.details),
                        ]),
                        h('span', { className: `badge ${log.status === 'success' ? 'badge-success' : 'badge-rejected'} small` }, log.status || 'unknown'),
                      ]))
                    ),
                h('button', { className: 'btn white small', style: { marginTop: '12px' }, onClick: () => setZktecoPage('list') }, 'Back to Devices'),
              ]),
            ]),

            adminPage === 'reports' && h('div', { className: 'card admin-section-card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, '📊 Reports'),
                  h('h2', null, 'Generate Reports'),
                  h('p', { className: 'muted' }, 'Export attendance, payroll, and HR data reports.'),
                ]),
              ]),
              h('div', { className: 'form-grid' }, [
                h('label', { className: 'field' }, [
                  'Report Type',
                  h('select', { value: reportType, onChange: (e) => setReportType(e.target.value) }, [
                    h('option', { value: 'attendance' }, 'Attendance Report'),
                    h('option', { value: 'payroll' }, 'Payroll Summary'),
                    h('option', { value: 'leaves' }, 'Leave Report'),
                    h('option', { value: 'employees' }, 'Employee Directory'),
                  ]),
                ]),
                h('label', { className: 'field' }, [
                  'Month',
                  h('select', { value: reportMonth, onChange: (e) => setReportMonth(Number(e.target.value)) },
                    MONTH_NAMES.map((mn, idx) => h('option', { key: idx, value: idx + 1 }, mn))
                  ),
                ]),
                h('label', { className: 'field' }, [
                  'Year',
                  h('input', { type: 'number', value: reportYear, onChange: (e) => setReportYear(Number(e.target.value)) }),
                ]),
              ]),
              h('div', { className: 'form-actions' }, [
                h('button', { className: 'btn primary', onClick: async () => {
                  setReportsLoading(true);
                  try {
                    const data = await apiRequest(`/api/reports/${reportType}/${reportYear}/${reportMonth}`, token);
                    setReportsData(data);
                    setMessage(`📊 ${reportType} report generated`);
                  } catch (err) {
                    setMessage(err.error || 'Failed to generate report');
                  } finally {
                    setReportsLoading(false);
                  }
                }, disabled: reportsLoading }, reportsLoading ? '⏳ Generating...' : '📊 Generate Report'),
                h('button', { className: 'btn secondary small', onClick: () => {
                  setReportsData(null);
                  setMessage('Reports cleared');
                } }, 'Clear'),
              ]),
              reportsData && h('div', { className: 'bulk-result-card', style: { marginTop: '16px', padding: '16px', borderRadius: '12px' } }, [
                h('p', { style: { fontWeight: 600 } }, '✅ Report generated successfully!'),
                h('p', { className: 'muted' }, reportType === 'attendance' ? `${reportsData.totalRecords || 0} records` : 'Check the data below'),
              ]),
            ]),

            adminPage === 'holidays' && h('div', { className: 'card admin-section-card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, '🎉 Holiday Calendar'),
                  h('h2', null, 'Manage Public Holidays'),
                  h('p', { className: 'muted' }, 'Add and manage company holidays. Holidays are marked as "O" in attendance.'),
                ]),
              ]),
              h('div', { className: 'form-grid', style: { marginBottom: '16px' } }, [
                h('label', { className: 'field' }, ['Holiday Name', h('input', { value: newHoliday.name, onChange: (e) => setNewHoliday(prev => ({ ...prev, name: e.target.value })), placeholder: 'e.g. UAE National Day' })]),
                h('label', { className: 'field' }, ['Date', h('input', { type: 'date', value: newHoliday.date, onChange: (e) => setNewHoliday(prev => ({ ...prev, date: e.target.value })) })]),
                h('label', { className: 'field' }, ['Type', h('select', { value: newHoliday.type, onChange: (e) => setNewHoliday(prev => ({ ...prev, type: e.target.value })) }, [
                  h('option', { value: 'public' }, 'Public Holiday'),
                  h('option', { value: 'company' }, 'Company Holiday'),
                  h('option', { value: 'religious' }, 'Religious Holiday'),
                ])]),
              ]),
              h('div', { className: 'form-actions' }, [
                h('button', { className: 'btn primary', onClick: async () => {
                  if (!newHoliday.name || !newHoliday.date) return setMessage('Please enter a holiday name and date');
                  try {
                    const savedHoliday = await apiRequest('/api/holidays', token, { method: 'POST', body: JSON.stringify(newHoliday) });
                    setHolidays(prev => [...prev, savedHoliday]);
                    setMessage(`🎉 Holiday "${newHoliday.name}" added!`);
                    setNewHoliday({ name: '', date: '', type: 'public' });
                  } catch (err) {
                    setMessage(err.error || 'Failed to add holiday');
                  }
                }, disabled: !newHoliday.name || !newHoliday.date }, '➕ Add Holiday'),
              ]),
              holidays.length > 0 && h('div', { style: { marginTop: '20px' } }, [
                h('h3', null, 'Upcoming Holidays'),
                h('div', { className: 'stagger-children' },
                  holidays.map((h, idx) => h('div', { key: idx, className: 'doc-item', style: { borderLeft: '3px solid #ff9800' } }, [
                    h('div', null, [
                      h('strong', null, h.name),
                      h('p', { className: 'muted' }, `${h.date} · ${h.type || 'Public'} holiday`),
                    ]),
                    h('span', { className: 'badge badge-pending' }, h.type || 'Public'),
                  ]))
                ),
              ]),
              holidays.length === 0 && h(EmptyState, { title: 'No holidays added', message: 'Add company holidays above to mark them in attendance.' }),
            ]),

            adminPage === 'departments' && h('div', { className: 'card admin-section-card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, '🏢 Departments'),
                  h('h2', null, 'Manage Departments'),
                  h('p', { className: 'muted' }, 'Organize employees into departments for better reporting.'),
                ]),
              ]),
              h('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-end' } }, [
                h('label', { className: 'field', style: { margin: 0, flex: 1 } }, [
                  'Department Name',
                  h('input', { value: newDepartment, onChange: (e) => setNewDepartment(e.target.value), placeholder: 'e.g. Kitchen, Service, Management' }),
                ]),
                h('button', { className: 'btn primary', onClick: async () => {
                  if (!newDepartment.trim()) return setMessage('Enter a department name');
                  setDepartments(prev => [...prev, { id: Date.now(), name: newDepartment.trim() }]);
                  setNewDepartment('');
                  setMessage(`Department "${newDepartment.trim()}" added`);
                }, disabled: !newDepartment.trim() }, '➕ Add'),
              ]),
              departments.length > 0
                ? h('div', { className: 'stagger-children' },
                    departments.map((dept) => h('div', { key: dept.id, className: 'doc-item', style: { borderLeft: '3px solid #2196f3' } }, [
                      h('div', null, [
                        h('strong', null, dept.name),
                        h('p', { className: 'muted' }, `${employees.filter(e => e.department === dept.name).length || 0} employees`),
                      ]),
                      h('button', { className: 'btn red small', onClick: () => {
                        setDepartments(prev => prev.filter(d => d.id !== dept.id));
                        setMessage(`"${dept.name}" removed`);
                      } }, 'Remove'),
                    ]))
                  )
                : h(EmptyState, { title: 'No departments yet', message: 'Create departments to organize your team.' }),
            ]),

            adminPage === 'auditLog' && h('div', { className: 'card admin-section-card' }, [
              h('div', { className: 'panel-heading' }, [
                h('div', null, [
                  h('p', { className: 'eyebrow' }, '📋 Audit Log'),
                  h('h2', null, 'System Activity Log'),
                  h('p', { className: 'muted' }, 'Track admin actions, changes, and system events.'),
                ]),
                h('button', { className: 'btn secondary small', onClick: async () => {
                  try {
                    const logs = await apiRequest('/api/audit-logs', token);
                    setAuditLogs(Array.isArray(logs) ? logs : []);
                    setMessage('Audit logs loaded');
                  } catch (err) {
                    setMessage(err.error || 'Failed to load audit logs');
                  }
                } }, '🔄 Refresh'),
              ]),
              auditLogs.length > 0
                ? h('div', { className: 'zkteco-sync-log-item' },
                    auditLogs.slice(0, 50).map((log, idx) => h('div', { key: idx, style: { padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' } }, [
                      h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
                        h('strong', null, log.action || log.event || 'Event'),
                        h('span', { className: 'muted', style: { fontSize: '11px' } }, new Date(log.createdAt || Date.now()).toLocaleString()),
                      ]),
                      h('p', { className: 'muted', style: { margin: '2px 0 0', fontSize: '12px' } }, log.details || log.description || `${log.performedBy || 'System'} performed ${log.action || 'an action'}`),
                    ]))
                  )
                : h(EmptyState, {
                    title: 'No audit logs loaded',
                    message: 'Click Refresh to load the latest system activity.',
                    actionLabel: 'Refresh',
                    onAction: async () => {
                      try {
                        const logs = await apiRequest('/api/audit-logs', token);
                        setAuditLogs(Array.isArray(logs) ? logs : []);
                      } catch (err) {
                        setMessage(err.error || 'Failed to load audit logs');
                      }
                    },
                  }),
            ]),

            adminPage === 'eos' && h('div', { className: 'eos-shell' }, [
              // Template upload section
              h('div', { className: 'card eos-hero card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'End of Service'),
                    h('h2', null, '📋 EOS Settlement Form'),
                    h('p', { className: 'muted' }, 'Upload your EOS PDF form, search an employee to auto-fill their info, then enter amounts manually and generate the filled PDF.'),
                  ]),
                  h('div', { className: 'eos-template-section', style: { marginTop: '12px', padding: '12px', borderRadius: '12px', background: 'var(--accent-soft)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, [
                    h('span', { style: { fontWeight: 600, fontSize: '13px' } }, '📄 PDF Form:'),
                    eosTemplateExists
                      ? [
                          h('span', { className: 'badge badge-success', style: { fontSize: '11px' } }, '✅ Form uploaded'),
                          eosTemplateInfo && h('span', { className: 'muted', style: { fontSize: '11px' } }, `${Math.round(eosTemplateInfo.size / 1024)} KB`),
                          h('button', {
                            className: 'btn white small',
                            onClick: async () => {
                              try {
                                await apiRequest('/api/eos/template', token, { method: 'DELETE' });
                                setEosTemplateExists(false);
                                setEosTemplateInfo(null);
                                setMessage('Template removed.');
                              } catch (err) { setMessage(err.error || 'Failed to delete template'); }
                            },
                          }, '🗑️ Remove'),
                        ]
                      : h('span', { className: 'muted', style: { fontSize: '12px' } }, 'No form uploaded - will use generated format'),
                    h('input', {
                      type: 'file',
                      accept: '.pdf',
                      style: { display: 'none' },
                      id: 'eos-template-input',
                      onChange: async (e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        setEosTemplateUploadBusy(true);
                        try {
                          const form = new FormData();
                          form.append('template', file);
                          await apiRequest('/api/eos/template-upload', token, { method: 'POST', body: form });
                          setEosTemplateExists(true);
                          const res = await fetch('/api/eos/template-status', { headers: { 'Authorization': 'Bearer ' + token } });
                          if (res.ok) { const data = await res.json(); setEosTemplateInfo(data.stats); }
                          setMessage('✅ PDF form uploaded! Now search an employee to fill their details.');
                        } catch (err) { setMessage(err.error || 'Upload failed'); }
                        finally { setEosTemplateUploadBusy(false); e.target.value = ''; }
                      },
                    }),
                    h('button', {
                      className: 'btn primary small',
                      onClick: () => document.getElementById('eos-template-input').click(),
                      disabled: eosTemplateUploadBusy,
                    }, eosTemplateUploadBusy ? '⏳ Uploading...' : '📤 Upload PDF Form'),
                  ]),
                ]),
              ]),
              // Search employee
              h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'Employee Lookup'),
                    h('h3', null, '🔍 Search Employee'),
                    h('p', { className: 'muted' }, 'Type employee ID or name to auto-fill their details on the form below.'),
                  ]),
                  h('div', { className: 'directory-controls' }, [
                    h('input', {
                      value: eosSearchQuery,
                      onChange: async (e) => {
                        setEosSearchQuery(e.target.value);
                        if (e.target.value.length >= 1) {
                          setEosSearchBusy(true);
                          try {
                            const results = await apiRequest(`/api/eos/search?q=${encodeURIComponent(e.target.value)}`, token);
                            setEosSearchResults(results);
                          } catch (err) { setEosSearchResults([]); }
                          finally { setEosSearchBusy(false); }
                        } else {
                          setEosSearchResults([]);
                        }
                      },
                      placeholder: 'Type employee ID or name...',
                    }),
                    eosSearchBusy && h('span', { className: 'badge' }, 'Searching...'),
                  ]),
                ]),
                eosSearchResults.length > 0 && !eosSelectedEmployee && h('div', { className: 'eos-search-results' },
                  eosSearchResults.map(emp => h('div', {
                    key: emp.id,
                    className: 'doc-item employee-row',
                    style: { cursor: 'pointer' },
                    onClick: async () => {
                      setEosSelectedEmployee(emp);
                      setEosSearchResults([]);
                      setEosSearchQuery(emp.name + ' (' + emp.employeeId + ')');
                      setEosBusy(true);
                      try {
                        const data = await apiRequest(`/api/eos/employee/${emp.employeeId}`, token);
                        setEosData(data);
                        setEosForm(prev => ({ ...prev, eosAmount: '', otherAllowances: '', deductions: '', endDate: new Date().toISOString().split('T')[0] }));
                      } catch (err) { setMessage(err.error || 'Failed to load employee data'); }
                      finally { setEosBusy(false); }
                    },
                  }, [
                    h('div', { className: 'employee-info' }, [
                      emp.photoUrl
                        ? h('img', { src: emp.photoUrl, className: 'employee-avatar', alt: emp.name })
                        : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(emp.name)),
                      h('div', { className: 'employee-meta' }, [
                        h('div', { className: 'employee-name-line' }, [
                          h('strong', null, emp.name || 'Unnamed'),
                          h('span', { className: 'employee-id-pill' }, emp.employeeId || ''),
                          h('span', { className: 'employee-role-pill' }, formatRole(emp.role)),
                        ]),
                        h('p', { className: 'employee-summary' }, `${emp.email || 'No email'} | ${emp.designation || 'No designation'}`),
                      ]),
                    ]),
                    h('span', { className: 'badge badge-pending' }, 'Select'),
                  ]))
                ),
              ]),
              eosBusy && h('p', { className: 'muted', style: { textAlign: 'center', padding: '20px' } }, 'Loading employee data...'),
              // MAIN FORM - matches PDF layout exactly (2-column table like the EOS form)
              eosData && eosSelectedEmployee && h('div', { className: 'eos-dashboard', style: { maxWidth: '950px', margin: '0 auto' } }, [
                // PDF Preview (if template uploaded)
                eosTemplateExists && h('div', { className: 'card', style: { marginBottom: '16px' } }, [
                  h('div', { className: 'panel-heading' }, [
                    h('div', null, [
                      h('p', { className: 'eyebrow' }, 'Form Preview'),
                      h('h3', null, '📄 PDF Form Preview'),
                    ]),
                  ]),
                  h('div', { style: { padding: '12px', background: '#f5f5f5' } }, [
                    h('iframe', { src: '/api/eos/template-preview?token=' + token, style: { width: '100%', height: '400px', border: '1px solid #ddd', borderRadius: '4px' }, title: 'EOS Form' }),
                  ]),
                ]),
                // SECTION 1: SERVICE INFORMATION (like the PDF)
                h('div', { className: 'card', style: { marginBottom: '16px' } }, [
                  h('div', { className: 'panel-heading' }, [
                    h('div', null, [
                      h('p', { className: 'eyebrow' }, 'Section 1'),
                      h('h3', null, '📋 Service Information'),
                    ]),
                    h('button', { className: 'btn white small', onClick: () => { setEosSelectedEmployee(null); setEosData(null); setEosSearchQuery(''); setEosSearchResults([]); } }, '✕ Change'),
                  ]),
                  // 2-column table layout matching PDF
                  h('div', { style: { padding: '16px' } }, [
                    h('div', { style: { display: 'table', width: '100%', borderCollapse: 'collapse' } }, [
                      // Row 1: Employee Name | Reason for Departure
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px', width: '35%' } }, 'Employee Name'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, eosData.employee.name || '—'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px', width: '35%' } }, 'Reason for Departure'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, 'Resignation with notice'),
                      ]),
                      // Row 2: Department | Contract Type
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Department'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, eosData.employee.department || '—'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Contract Type'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, 'Limited term'),
                      ]),
                      // Row 3: Title | Basic Salary
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Title'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, eosData.employee.designation || '—'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Basic Salary (Departure Month)'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, formatMoney(eosData.eos.basicSalary)),
                      ]),
                      // Row 4: Hire Date | Total Service Duration
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Hire Date'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, new Date(eosData.eos.joinDate).toLocaleDateString()),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Total Service Duration'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, `${eosData.eos.eosCalculation.years}y ${eosData.eos.eosCalculation.months}m ${eosData.eos.eosCalculation.days}d`),
                      ]),
                      // Row 5: Total Gratuity Days | Employee ID
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Total Gratuity Days'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, String(eosData.eos.totalServiceDays)),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Employee ID'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, eosData.employee.employeeId),
                      ]),
                      // Row 6: Unpaid Gratuity Days | Departure Date
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Unpaid Gratuity Days'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, '0'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Daily Wage'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, formatMoney(eosData.eos.dailyWage)),
                      ]),
                      // Row 7: Departure Date (full row)
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Departure Date'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, eosForm.endDate ? new Date(eosForm.endDate).toLocaleDateString() : new Date().toLocaleDateString()),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', background: '#f5f5f5', fontWeight: 600, fontSize: '13px' } }, 'Company Name'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } },
                          h('select', { value: eosForm.companyName, onChange: (e) => setEosForm(prev => ({ ...prev, companyName: e.target.value })) }, [
                            h('option', { value: 'A K S Reyadah Trading L.L.C' }, 'A K S Reyadah Trading L.L.C'),
                            h('option', { value: 'REYADAH HR' }, 'REYADAH HR'),
                          ])
                        ),
                      ]),
                    ]),
                  ]),
                ]),
                // SECTION 2: FINAL SETTLEMENT AMOUNT (like the PDF)
                h('div', { className: 'card', style: { marginBottom: '16px' } }, [
                  h('div', { className: 'panel-heading' }, [
                    h('div', null, [
                      h('p', { className: 'eyebrow' }, 'Section 2'),
                      h('h3', null, '💰 Final Settlement Amount - Enter Values'),
                      h('p', { className: 'muted' }, 'Fill in the amounts in AED. These will appear on the PDF.'),
                    ]),
                    h('label', { className: 'field', style: { maxWidth: '200px' } }, [
                      'EOS Date',
                      h('input', { type: 'date', value: eosForm.endDate, onChange: (e) => setEosForm(prev => ({ ...prev, endDate: e.target.value })) }),
                    ]),
                  ]),
                  h('div', { style: { padding: '16px' } }, [
                    // Additions table
                    h('div', { style: { fontWeight: 600, color: '#1976d2', marginBottom: '8px', fontSize: '15px' } }, 'Additions'),
                    h('div', { style: { display: 'table', width: '100%', borderCollapse: 'collapse' } }, [
                      // Header row
                      h('div', { style: { display: 'table-row', background: '#e3f2fd' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '40%' } }, 'Item'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '35%' } }, 'Remarks'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '25%', textAlign: 'right' } }, 'Amount (AED)'),
                      ]),
                      // Gratuity row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, 'Gratuity'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: '12px', color: '#666' } }, 'Calculated as per UAE labour law'),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.eosAmount, onChange: (e) => setEosForm(prev => ({ ...prev, eosAmount: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                      // Annual Leave row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, 'Leave Encashment'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: '12px', color: '#666' } }, 'Annual Leave'),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.annualLeaveAmount || '', onChange: (e) => setEosForm(prev => ({ ...prev, annualLeaveAmount: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                      // PH Comp Off row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, '(PH) Compensatory Off'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: '12px', color: '#666' } }, 'PH Comp Days'),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.phLeaveAmount || '', onChange: (e) => setEosForm(prev => ({ ...prev, phLeaveAmount: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                      // Monthly Pay row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, 'Monthly Pay'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: '12px', color: '#666' } }, 'Pro-rated pay'),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.monthlyPay || '', onChange: (e) => setEosForm(prev => ({ ...prev, monthlyPay: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                      // Other Allowances row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, 'Other Allowances'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: '12px', color: '#666' } }, 'Additional'),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.otherAllowances, onChange: (e) => setEosForm(prev => ({ ...prev, otherAllowances: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                      // Total Additions (calculated)
                      h('div', { style: { display: 'table-row', background: '#e8f5e9' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 700, fontSize: '14px' } }, 'Total of Additions'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, ''),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 700, textAlign: 'right', color: '#1976d2' } },
                          formatMoney(
                            parseFloat(eosForm.eosAmount || 0) + parseFloat(eosForm.annualLeaveAmount || 0) +
                            parseFloat(eosForm.phLeaveAmount || 0) + parseFloat(eosForm.monthlyPay || 0) +
                            parseFloat(eosForm.otherAllowances || 0)
                          )
                        ),
                      ]),
                    ]),
                    // Deductions section
                    h('div', { style: { fontWeight: 600, color: '#c62828', marginTop: '16px', marginBottom: '8px', fontSize: '15px' } }, 'Deductions'),
                    h('div', { style: { display: 'table', width: '100%', borderCollapse: 'collapse' } }, [
                      h('div', { style: { display: 'table-row', background: '#ffebee' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '40%' } }, 'Item'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '35%' } }, 'Remarks'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600, fontSize: '13px', width: '25%', textAlign: 'right' } }, 'Amount (AED)'),
                      ]),
                      // Deductions row
                      h('div', { style: { display: 'table-row' } }, [
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0', fontWeight: 600 } }, 'Total of Deductions'),
                        h('div', { style: { display: 'table-cell', padding: '8px 12px', border: '1px solid #e0e0e0' } }, ''),
                        h('div', { style: { display: 'table-cell', padding: '4px 12px', border: '1px solid #e0e0e0' } },
                          h('input', { type: 'number', value: eosForm.deductions, onChange: (e) => setEosForm(prev => ({ ...prev, deductions: e.target.value })), placeholder: '0.00', style: { width: '100%', textAlign: 'right', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' } })
                        ),
                      ]),
                    ]),
                    // FINAL SETTLEMENT AMOUNT
                    h('div', { style: { display: 'table', width: '100%', borderCollapse: 'collapse', marginTop: '16px' } }, [
                      h('div', { style: { display: 'table-row', background: '#e3f2fd' } }, [
                        h('div', { style: { display: 'table-cell', padding: '12px', border: '2px solid #1976d2', fontWeight: 700, fontSize: '16px', color: '#1976d2' } }, 'Final Settlement Amount'),
                        h('div', { style: { display: 'table-cell', padding: '12px', border: '2px solid #1976d2', fontWeight: 700, fontSize: '18px', color: '#1976d2', textAlign: 'right' } },
                          formatMoney(
                            parseFloat(eosForm.eosAmount || 0) + parseFloat(eosForm.annualLeaveAmount || 0) +
                            parseFloat(eosForm.phLeaveAmount || 0) + parseFloat(eosForm.monthlyPay || 0) +
                            parseFloat(eosForm.otherAllowances || 0) - parseFloat(eosForm.deductions || 0)
                          )
                        ),
                      ]),
                    ]),
                    // Notes
                    h('label', { className: 'field', style: { marginTop: '12px' } }, [
                      'Notes (optional)',
                      h('textarea', { value: eosForm.notes, onChange: (e) => setEosForm(prev => ({ ...prev, notes: e.target.value })), rows: 2, placeholder: 'Additional notes...' }),
                    ]),
                    // Generate button
                    h('div', { className: 'form-actions', style: { marginTop: '16px' } }, [
                      h('button', { className: 'btn primary', style: { padding: '12px 32px', fontSize: '16px' }, onClick: async () => {
                        setEosPdfBusy(true);
                        try {
                          const response = await fetch('/api/eos/generate-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({
                            employeeId: eosSelectedEmployee.employeeId, companyName: eosForm.companyName,
                            eosAmount: parseFloat(eosForm.eosAmount || 0), annualLeaveAmount: parseFloat(eosForm.annualLeaveAmount || 0),
                            phLeaveAmount: parseFloat(eosForm.phLeaveAmount || 0), monthlyPay: parseFloat(eosForm.monthlyPay || 0),
                            otherAllowances: parseFloat(eosForm.otherAllowances || 0), deductions: parseFloat(eosForm.deductions || 0),
                            notes: eosForm.notes, endDate: eosForm.endDate,
                          })});
                          if (!response.ok) { const err = await response.json(); throw err; }
                          const blob = await response.blob();
                          const filename = `EOS_${eosSelectedEmployee.employeeId}_${eosForm.endDate || new Date().toISOString().split('T')[0]}.pdf`;
                          const url = URL.createObjectURL(blob); const a = document.createElement('a');
                          a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
                          setMessage('✅ EOS PDF generated and downloaded successfully!');
                        } catch (err) { setMessage(err.error || 'Failed to generate PDF'); }
                        finally { setEosPdfBusy(false); }
                      }, disabled: eosPdfBusy || !eosForm.companyName }, eosPdfBusy ? '⏳ Generating PDF...' : '📄 Generate & Download PDF'),
                      h('button', { className: 'btn secondary', onClick: () => setEosForm(prev => ({ ...prev, eosAmount: '', annualLeaveAmount: '', phLeaveAmount: '', monthlyPay: '', otherAllowances: '', deductions: '', notes: '' })) }, 'Clear All'),
                    ]),
                  ]),
                ]),
              ]),
              !eosData && !eosBusy && h('div', { className: 'card' }, [
                h(EmptyState, {
                  title: 'Search for an employee',
                  message: 'Type an employee ID or name above to auto-fill their details on the form.',
                  actionLabel: null,
                }),
              ]),
            ]),
            adminPage === 'biometric' && h('div', { className: 'leave-balance-shell' }, [
              h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, '🔐 Biometric Integration'),
                    h('h2', null, 'Biometric Device API'),
                    h('p', { className: 'muted' }, 'Register devices and generate API keys for biometric vendors (ZKTeco, etc.) to push attendance data.'),
                  ]),
                  h('button', { className: 'btn primary small', onClick: async () => {
                    const name = prompt('Enter device name (e.g. Main ZKTeco):');
                    if (!name) return;
                    try {
                      const result = await apiRequest('/api/biometric/register', token, {
                        method: 'POST',
                        body: JSON.stringify({ name, model: 'ZKTeco', location: 'Main Office' }),
                      });
                      setMessage('✅ Device registered! API Key: ' + result.device.apiKey);
                      // Reload devices
                      const devices = await apiRequest('/api/biometric/devices', token);
                      setBiometricDevices(Array.isArray(devices) ? devices : []);
                    } catch (err) {
                      setMessage(err.error || 'Failed to register device');
                    }
                  } }, '➕ Register Device'),
                  h('button', { className: 'btn secondary small', style: { marginLeft: '8px' }, onClick: async () => {
                    try {
                      const devices = await apiRequest('/api/biometric/devices', token);
                      setBiometricDevices(Array.isArray(devices) ? devices : []);
                      setMessage('Devices loaded');
                    } catch (err) {
                      setMessage(err.error || 'Failed to load devices');
                    }
                  } }, '🔄 Refresh'),
                ]),
              ]),
              h('div', { className: 'grid', style: { gap: '12px' } },
                biometricDevices && biometricDevices.length > 0
                  ? biometricDevices.map((d) => h('div', { key: d.id, className: 'card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' } }, [
                        h('div', null, [
                          h('strong', { style: { fontSize: '15px' } }, d.name),
                          h('p', { className: 'muted', style: { fontSize: '12px', margin: '4px 0' } }, 
                            `${d.model || 'N/A'} · ${d.location || 'N/A'} · ${d.serialNumber || 'No SN'}`
                          ),
                        ]),
                        h('span', { className: `badge ${d.isActive ? 'badge-success' : 'badge-rejected'} small` }, d.isActive ? 'Active' : 'Inactive'),
                      ]),
                      h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
                        h('span', { className: 'badge small' }, `${d.totalTransactions || 0} transactions`),
                        d.lastSyncAt && h('span', { className: 'muted', style: { fontSize: '11px' } }, `Last sync: ${new Date(d.lastSyncAt).toLocaleString()}`),
                      ]),
                      h('div', { style: { marginTop: '10px', padding: '10px', background: 'var(--accent-soft)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' } }, [
                        h('strong', null, 'API Key: '),
                        h('span', { style: { color: 'var(--accent)', fontWeight: 600 } }, d.apiKey || 'N/A'),
                      ]),
                      h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                        h('button', { className: 'btn red small', onClick: async () => {
                          if (!window.confirm('Delete this device permanently? This cannot be undone.')) return;
                          try {
                            await apiRequest('/api/biometric/devices/' + d.id, token, { method: 'DELETE' });
                            setMessage('Device deleted');
                            const devices = await apiRequest('/api/biometric/devices', token);
                            setBiometricDevices(Array.isArray(devices) ? devices : []);
                          } catch (err) {
                            setMessage(err.error || 'Failed to delete device');
                          }
                        } }, '🗑️ Delete'),
                      ]),
                    ]))
                  : h('div', { className: 'card' }, [
                      h(EmptyState, { title: 'No devices registered', message: 'Click "Register Device" to create an API key for your biometric vendor.', actionLabel: 'Register Device', onAction: async () => {
                        const name = prompt('Enter device name (e.g. Main ZKTeco):');
                        if (!name) return;
                        try {
                          const result = await apiRequest('/api/biometric/register', token, {
                            method: 'POST',
                            body: JSON.stringify({ name, model: 'ZKTeco', location: 'Main Office' }),
                          });
                          setMessage('✅ Device registered! API Key: ' + result.device.apiKey);
                          const devices = await apiRequest('/api/biometric/devices', token);
                          setBiometricDevices(Array.isArray(devices) ? devices : []);
                        } catch (err) {
                          setMessage(err.error || 'Failed to register device');
                        }
                      } }),
                    ])
              ),
              // Test Console
              h('div', { className: 'card', style: { marginTop: '12px' } }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, '🧪 Test Console'),
                    h('h3', null, 'Test Biometric API'),
                    h('p', { className: 'muted' }, 'Send test attendance data to verify the API works without a live device.'),
                  ]),
                ]),
                h('div', { style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } }, [
                  h('label', { className: 'field' }, [
                    'API Key (select a registered device above and copy its key)',
                    h('input', {
                      id: 'test-api-key',
                      value: testApiKey,
                      onChange: (e) => setTestApiKey(e.target.value),
                      placeholder: 'rh_...',
                      style: { fontFamily: 'monospace' },
                    }),
                  ]),
                  h('label', { className: 'field' }, [
                    'Employee ID',
                    h('input', {
                      id: 'test-employee-id',
                      value: testEmployeeId,
                      onChange: (e) => setTestEmployeeId(e.target.value),
                      placeholder: 'E001',
                    }),
                  ]),
                  h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                    h('label', { className: 'field', style: { flex: 1 } }, [
                      'Clock In Time',
                      h('input', {
                        type: 'datetime-local',
                        id: 'test-clock-in',
                        value: testClockIn,
                        onChange: (e) => setTestClockIn(e.target.value),
                      }),
                    ]),
                    h('label', { className: 'field', style: { flex: 1 } }, [
                      'Clock Out Time',
                      h('input', {
                        type: 'datetime-local',
                        id: 'test-clock-out',
                        value: testClockOut,
                        onChange: (e) => setTestClockOut(e.target.value),
                      }),
                    ]),
                  ]),
                  h('div', { style: { display: 'flex', gap: '8px' } }, [
                    h('button', {
                      className: 'btn primary small',
                      onClick: async () => {
                        if (!testApiKey || !testEmployeeId) {
                          setMessage('Enter API key and Employee ID first');
                          return;
                        }
                        setTestBusy(true);
                        setTestResult(null);
                        const logs = [];
                        if (testClockIn) {
                          logs.push({
                            employeeId: testEmployeeId,
                            punchTime: new Date(testClockIn).toISOString(),
                            punchType: 'in',
                            punchMode: 'fingerprint',
                            verified: true,
                          });
                        }
                        if (testClockOut) {
                          logs.push({
                            employeeId: testEmployeeId,
                            punchTime: new Date(testClockOut).toISOString(),
                            punchType: 'out',
                            punchMode: 'fingerprint',
                            verified: true,
                          });
                        }
                        if (logs.length === 0) {
                          setMessage('Enter at least one clock time');
                          setTestBusy(false);
                          return;
                        }
                        try {
                          const res = await fetch('/api/biometric/attendance', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'X-API-Key': testApiKey,
                            },
                            body: JSON.stringify({ deviceId: 'test-console', logs }),
                          });
                          const data = await res.json();
                          setTestResult(JSON.stringify(data, null, 2));
                          if (res.ok) {
                            setMessage('✅ Test successful! Attendance recorded.');
                            await loadAttendance();
                          } else {
                            setMessage('❌ Test failed: ' + (data.error || 'Unknown error'));
                          }
                        } catch (err) {
                          setTestResult('Error: ' + err.message);
                          setMessage('❌ Network error');
                        } finally {
                          setTestBusy(false);
                        }
                      },
                      disabled: testBusy,
                    }, testBusy ? '⏳ Sending...' : '🚀 Send Test Data'),
                    h('button', {
                      className: 'btn white small',
                      onClick: () => {
                        setTestResult(null);
                        setTestApiKey('');
                        setTestEmployeeId('');
                        const now = new Date();
                        const today = now.toISOString().slice(0, 10);
                        setTestClockIn(today + 'T08:00');
                        setTestClockOut(today + 'T17:00');
                      },
                    }, 'Clear'),
                  ]),
                  testResult && h('div', { style: { marginTop: '8px', padding: '10px', background: '#1a1a1a', color: '#4caf50', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' } }, testResult),
                ]),
              ]),
              // API Documentation
              h('div', { className: 'card', style: { marginTop: '12px' } }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, '📖 API Documentation'),
                    h('h3', null, 'How to Integrate'),
                    h('p', { className: 'muted' }, 'Share these instructions with your biometric device vendor.'),
                  ]),
                ]),
                h('div', { style: { padding: '12px', background: 'var(--input-bg)', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: '1.6' } }, [
                  'POST https://reyadah-hr.onrender.com/api/biometric/attendance',
                  'Headers:',
                  '  X-API-Key: [your-api-key]',
                  '  Content-Type: application/json',
                  '',
                  'Body (JSON):',
                  JSON.stringify({
                    deviceId: 'ZK-001',
                    logs: [
                      { employeeId: 'E001', punchTime: '2026-07-18T08:30:00', punchType: 'in', punchMode: 'fingerprint', verified: true },
                      { employeeId: 'E001', punchTime: '2026-07-18T17:30:00', punchType: 'out', punchMode: 'fingerprint', verified: true },
                    ]
                  }, null, 2),
                ].join('\n')),
              ]),
            ]),
            adminPage === 'tickets' && h('div', { className: 'leave-balance-shell' }, [
              h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, '🎫 Support Tickets'),
                    h('h2', null, 'Technical Issues & Support Requests'),
                    h('p', { className: 'muted' }, 'All tickets raised by employees are shown here. Respond to close them.'),
                  ]),
                  h('button', { className: 'btn secondary small', onClick: async () => {
                    try {
                      const data = await apiRequest('/api/requests/tickets/all', token);
                      setTickets(Array.isArray(data) ? data : []);
                      setMessage('Tickets loaded');
                    } catch (err) {
                      setMessage(err.error || 'Failed to load tickets');
                    }
                  } }, '🔄 Refresh'),
                ]),
              ]),
              h('div', { className: 'grid', style: { gap: '12px' } },
                tickets.length > 0
                  ? tickets.map((t) => h('div', { key: t.id, className: 'card', style: { padding: '16px', border: '1px solid var(--border)' } }, [
                      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, [
                        t.Employee && (t.Employee.photoUrl
                          ? h('img', { src: t.Employee.photoUrl, className: 'employee-avatar', alt: t.Employee.name })
                          : h('div', { className: 'employee-avatar placeholder' }, initialsFrom(t.Employee?.name || '?'))),
                        h('div', { style: { flex: 1 } }, [
                          h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } }, [
                            h('strong', { style: { fontSize: '15px' } }, t.subject),
                            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
                              h('span', { className: `badge ${t.status === 'open' ? 'badge-pending' : t.status === 'in-progress' ? 'badge-pending' : 'badge-success'} small` }, t.status || 'open'),
                              t.priority && h('span', { className: `badge ${t.priority === 'high' || t.priority === 'urgent' ? 'badge-rejected' : 'badge-pending'} small` }, t.priority),
                              t.category && h('span', { className: 'badge small' }, t.category),
                            ]),
                          ]),
                          h('p', { className: 'muted', style: { fontSize: '12px', margin: '4px 0' } }, 
                            `${t.Employee?.name || 'Unknown'} (${t.employeeId}) · ${new Date(t.createdAt).toLocaleString()}`
                          ),
                          h('p', { style: { marginTop: '8px', fontSize: '13px', color: 'var(--text)', whiteSpace: 'pre-wrap' } }, t.description),
                          t.adminResponse && h('div', { style: { marginTop: '8px', padding: '8px 12px', background: 'var(--accent-soft)', borderRadius: '8px', borderLeft: '3px solid #1976d2' } }, [
                            h('strong', { style: { fontSize: '12px', color: '#1976d2' } }, 'Admin Response:'),
                            h('p', { style: { marginTop: '4px', fontSize: '12px' } }, t.adminResponse),
                          ]),
                        ]),
                      ]),
                      (t.status === 'open' || t.status === 'in-progress') && h('div', { style: { marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                        h('input', {
                          id: `ticket-resp-${t.id}`,
                          style: { flex: 1, minWidth: '200px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' },
                          placeholder: 'Type your response...',
                          onKeyDown: async (e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              try {
                                await apiRequest('/api/requests/tickets/' + t.id, token, {
                                  method: 'PUT',
                                  body: JSON.stringify({ adminResponse: e.target.value.trim(), status: 'resolved' }),
                                });
                                e.target.value = '';
                                const data = await apiRequest('/api/requests/tickets/all', token);
                                setTickets(Array.isArray(data) ? data : []);
                                setMessage('✅ Ticket resolved');
                              } catch (err) {
                                setMessage(err.error || 'Failed to respond');
                              }
                            }
                          },
                        }),
                        h('button', {
                          className: 'btn primary small',
                          onClick: async (e) => {
                            const input = document.getElementById(`ticket-resp-${t.id}`);
                            if (!input || !input.value.trim()) return;
                            try {
                              await apiRequest('/api/requests/tickets/' + t.id, token, {
                                method: 'PUT',
                                body: JSON.stringify({ adminResponse: input.value.trim(), status: 'resolved' }),
                              });
                              input.value = '';
                              const data = await apiRequest('/api/requests/tickets/all', token);
                              setTickets(Array.isArray(data) ? data : []);
                              setMessage('✅ Ticket resolved');
                            } catch (err) {
                              setMessage(err.error || 'Failed to respond');
                            }
                          },
                        }, '✅ Resolve'),
                        h('button', {
                          className: 'btn white small',
                          onClick: async () => {
                            try {
                              await apiRequest('/api/requests/tickets/' + t.id, token, {
                                method: 'PUT',
                                body: JSON.stringify({ status: 'closed' }),
                              });
                              const data = await apiRequest('/api/requests/tickets/all', token);
                              setTickets(Array.isArray(data) ? data : []);
                              setMessage('Ticket closed');
                            } catch (err) {
                              setMessage(err.error || 'Failed to close ticket');
                            }
                          },
                        }, 'Close'),
                      ]),
                    ]))
                  : h('div', { className: 'card' }, [
                      h(EmptyState, { title: 'No tickets yet', message: 'When employees raise tickets via the AI Assistant or Request Hub, they will appear here.', actionLabel: 'Refresh', onAction: async () => {
                        try {
                          const data = await apiRequest('/api/requests/tickets/all', token);
                          setTickets(Array.isArray(data) ? data : []);
                        } catch (err) {
                          setMessage(err.error || 'Failed to load tickets');
                        }
                      } }),
                    ])
              ),
            ]),
            adminPage === 'leaveBalances' && h('div', { className: 'leave-balance-shell' }, [
              h('div', { className: 'card' }, [
                h('div', { className: 'panel-heading' }, [
                  h('div', null, [
                    h('p', { className: 'eyebrow' }, 'Leave Balances'),
                    h('h2', null, 'Annual & PH Leave Balances'),
                    h('p', { className: 'muted' }, `${filteredLeaveBalances.length} of ${leaveBalances.length} employees shown`),
                  ]),
                  h('div', { className: 'directory-controls' }, [
                    h('input', { value: employeeSearch, onChange: (event) => setEmployeeSearch(event.target.value), placeholder: 'Search name, ID, designation, role' }),
                    h('button', { className: 'btn secondary small', onClick: loadLeaveBalances, disabled: leaveBalanceBusy }, leaveBalanceBusy ? 'Loading...' : 'Refresh'),
                  ]),
                ]),
                // Summary totals
                leaveBalances.length > 0 && h('div', { className: 'stats-grid', style: { marginBottom: '16px' } }, [
                  h(StatTile, { label: 'Total Annual Balance', value: leaveBalanceTotals.annualBalance, variant: 'white' }),
                  h(StatTile, { label: 'Total PH Balance', value: leaveBalanceTotals.phBalance, variant: 'white' }),
                  h(StatTile, { label: 'Pending Annual', value: leaveBalanceTotals.annualPending, variant: 'light' }),
                  h(StatTile, { label: 'Pending PH', value: leaveBalanceTotals.phPending, variant: 'light' }),
                ]),
                // Leave balance table
                filteredLeaveBalances.length > 0
                  ? h('div', { className: 'leave-balance-table' }, [
                      h('div', { className: 'leave-balance-header' }, [
                        h('div', { className: 'leave-balance-employee' }, 'Employee'),
                        h('div', { className: 'leave-balance-metric' }, [h('strong', null, 'Annual'), h('span', null, 'Balance')]),
                        h('div', { className: 'leave-balance-metric' }, [h('strong', null, 'Annual'), h('span', null, 'Pending')]),
                        h('div', { className: 'leave-balance-metric' }, [h('strong', null, 'PH'), h('span', null, 'Balance')]),
                        h('div', { className: 'leave-balance-metric' }, [h('strong', null, 'PH'), h('span', null, 'Pending')]),
                      ]),
                      h('div', { className: 'leave-balance-slider' }, [
                        h('div', { className: 'leave-balance-slide-container' },
                          filteredLeaveBalances.map((emp) => h('div', { key: emp.employeeId || emp.id, className: 'leave-balance-row' }, [
                            h('div', { className: 'leave-balance-employee' }, [
                              h('strong', null, emp.name || emp.employeeId),
                              h('p', null, `${emp.employeeId} · ${emp.designation || 'No designation'}`),
                            ]),
                            h('div', { className: 'leave-balance-metric' }, [h('strong', null, emp.annual?.balance ?? 0), h('span', null, 'days')]),
                            h('div', { className: 'leave-balance-metric' }, [h('strong', null, emp.annual?.pending ?? 0), h('span', null, 'days')]),
                            h('div', { className: 'leave-balance-metric' }, [h('strong', null, emp.ph?.balance ?? 0), h('span', null, 'days')]),
                            h('div', { className: 'leave-balance-metric' }, [h('strong', null, emp.ph?.pending ?? 0), h('span', null, 'days')]),
                          ]))
                        ),
                      ]),
                    ])
                  : h(EmptyState, {
                      title: leaveBalances.length === 0 ? 'No leave balances loaded' : 'No matching employees',
                      message: leaveBalances.length === 0 ? 'Click Refresh to load leave balances from the system.' : 'Try a different search term.',
                      actionLabel: 'Refresh',
                      onAction: loadLeaveBalances,
                    }),
              ]),
            ]),
        ]),
      ]),
      h(AiChatWidget, { token, user }),
      cameraOpen && h(CameraCapture, {
        type: cameraType,
        onCapture: handleSelfieCapture,
        onClose: () => { setCameraOpen(false); setCameraType(null); },
      }),
      h('div', { className: 'message-panel' }, message ? h('div', { className: 'message-card' }, message) : null),
    ]),
  ]);
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
