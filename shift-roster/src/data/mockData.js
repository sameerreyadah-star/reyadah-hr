export const mockEmployees = [
  { id: "EMP001", name: "Ahmed Mohammed", department: "Engineering", position: "Senior Developer", avatar: null },
  { id: "EMP002", name: "Sara Ali", department: "Design", position: "UI/UX Designer", avatar: null },
  { id: "EMP003", name: "Mohammed Hassan", department: "Engineering", position: "Backend Developer", avatar: null },
  { id: "EMP004", name: "Fatima Noor", department: "HR", position: "HR Manager", avatar: null },
  { id: "EMP005", name: "Khalid Omar", department: "Marketing", position: "Marketing Lead", avatar: null },
  { id: "EMP006", name: "Nora Ahmed", department: "Finance", position: "Accountant", avatar: null },
  { id: "EMP007", name: "Saeed Rashid", department: "Engineering", position: "Frontend Developer", avatar: null },
  { id: "EMP008", name: "Mona Adel", department: "Design", position: "Graphic Designer", avatar: null },
  { id: "EMP009", name: "Hassan Ali", department: "Sales", position: "Sales Executive", avatar: null },
  { id: "EMP010", name: "Layla Ibrahim", department: "HR", position: "Recruiter", avatar: null },
];

export const mockCompanies = [
  { id: 1, name: "Reyadah HR Solutions" },
  { id: 2, name: "Tech Innovators LLC" },
];

export const mockBranches = [
  { id: 1, name: "Head Office - Dubai", companyId: 1 },
  { id: 2, name: "Branch - Abu Dhabi", companyId: 1 },
  { id: 3, name: "Branch - Sharjah", companyId: 2 },
];

export const mockDepartments = [
  { id: 1, name: "Engineering" },
  { id: 2, name: "Design" },
  { id: 3, name: "HR" },
  { id: 4, name: "Marketing" },
  { id: 5, name: "Finance" },
  { id: 6, name: "Sales" },
  { id: 7, name: "Operations" },
];

export const mockDesignations = [
  { id: 1, name: "Senior Developer", departmentId: 1 },
  { id: 2, name: "Backend Developer", departmentId: 1 },
  { id: 3, name: "Frontend Developer", departmentId: 1 },
  { id: 4, name: "UI/UX Designer", departmentId: 2 },
  { id: 5, name: "Graphic Designer", departmentId: 2 },
  { id: 6, name: "HR Manager", departmentId: 3 },
  { id: 7, name: "Recruiter", departmentId: 3 },
  { id: 8, name: "Marketing Lead", departmentId: 4 },
  { id: 9, name: "Accountant", departmentId: 5 },
  { id: 10, name: "Sales Executive", departmentId: 6 },
];

export const mockShifts = [
  { id: "SHIFT001", name: "Morning Shift", code: "MORN", startTime: "06:00", endTime: "14:00", color: "#3B82F6" },
  { id: "SHIFT002", name: "Evening Shift", code: "EVEN", startTime: "14:00", endTime: "22:00", color: "#8B5CF6" },
  { id: "SHIFT003", name: "Night Shift", code: "NIGHT", startTime: "22:00", endTime: "06:00", color: "#1F2937" },
  { id: "SHIFT004", name: "General Shift", code: "GEN", startTime: "09:00", endTime: "18:00", color: "#2563EB" },
];

export const mockShiftAssignments = [];

export const mockStatuses = [
  { value: "all", label: "All Status" },
  { value: "assigned", label: "Assigned" },
  { value: "unassigned", label: "Unassigned" },
  { value: "leave", label: "On Leave" },
  { value: "holiday", label: "Holiday" },
];

export const shiftTypes = [
  { id: "morning", label: "Morning Shift", color: "#3B82F6", bgColor: "#EFF6FF" },
  { id: "evening", label: "Evening Shift", color: "#8B5CF6", bgColor: "#F5F3FF" },
  { id: "night", label: "Night Shift", color: "#1F2937", bgColor: "#F3F4F6" },
  { id: "off", label: "Weekly Off", color: "#6B7280", bgColor: "#F9FAFB" },
  { id: "leave", label: "Leave", color: "#EF4444", bgColor: "#FEF2F2" },
  { id: "holiday", label: "Holiday", color: "#10B981", bgColor: "#ECFDF5" },
  { id: "halfday", label: "Half Day", color: "#F59E0B", bgColor: "#FFFBEB" },
];