import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/Card';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { X, Save, Clock, Users, ToggleLeft, RotateCcw } from 'lucide-react';

export default function ShiftCreationForm({ onClose, onCreateShift, onBulkAssign, employees = [], shifts = [] }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('create');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    startTime: '09:00',
    endTime: '18:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    graceTime: '15',
    lateAllowance: '30',
    earlyExitAllowance: '15',
    minWorkingHours: '8',
    maxWorkingHours: '10',
    weeklyOff: 'Friday',
    workingDays: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: false,
      saturday: false,
      sunday: false,
    },
    isNightShift: false,
    isFlexible: false,
    crossMidnight: false,
    allowOvertime: true,
  });

  const [bulkData, setBulkData] = useState({
    shiftId: '',
    startDate: '',
    endDate: '',
    employeeIds: [],
    departmentFilter: '',
  });

  const [errors, setErrors] = useState({});

  const daysOfWeek = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleDayToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      workingDays: { ...prev.workingDays, [day]: !prev.workingDays[day] },
    }));
  };

  const handleBulkChange = (field, value) => {
    setBulkData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Shift name is required';
    if (!formData.code.trim()) newErrors.code = 'Shift code is required';
    if (!formData.startTime) newErrors.startTime = 'Start time is required';
    if (!formData.endTime) newErrors.endTime = 'End time is required';
    
    // Validate working days - at least one selected
    const hasWorkingDay = Object.values(formData.workingDays).some(v => v);
    if (!hasWorkingDay) newErrors.workingDays = 'Select at least one working day';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) {
      addToast('Please fix the validation errors', 'error');
      return;
    }
    onCreateShift(formData);
  };

  const handleBulkAssign = () => {
    if (!bulkData.shiftId || !bulkData.startDate || !bulkData.endDate) {
      addToast('Please fill all bulk assignment fields', 'error');
      return;
    }
    
    const empIds = bulkData.employeeIds.length > 0 
      ? bulkData.employeeIds 
      : employees.map(e => e.id);

    if (bulkData.departmentFilter) {
      const filtered = employees
        .filter(e => e.department === bulkData.departmentFilter)
        .map(e => e.id);
      onBulkAssign(filtered, bulkData.shiftId, bulkData.startDate, bulkData.endDate);
    } else {
      onBulkAssign(empIds, bulkData.shiftId, bulkData.startDate, bulkData.endDate);
    }
  };

  const handleSelectAllEmployees = () => {
    const allIds = employees.map(e => e.id);
    handleBulkChange('employeeIds', 
      bulkData.employeeIds.length === allIds.length ? [] : allIds
    );
  };

  const toggleEmployee = (empId) => {
    handleBulkChange('employeeIds',
      bulkData.employeeIds.includes(empId)
        ? bulkData.employeeIds.filter(id => id !== empId)
        : [...bulkData.employeeIds, empId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-y-auto bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-4xl mx-4 animate-slide-in-up max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <CardTitle>Create New Shift</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Configure shift details and assign employees</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </CardHeader>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-gray-100">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('create')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'create'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock className="h-4 w-4 inline mr-2" />
              Shift Details
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'bulk'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="h-4 w-4 inline mr-2" />
              Bulk Assignment
            </button>
          </div>
        </div>

        <CardContent className="p-6">
          {activeTab === 'create' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Shift Name *"
                    placeholder="e.g. Morning Shift"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    error={errors.name}
                  />
                  <Input
                    label="Shift Code *"
                    placeholder="e.g. MORN"
                    value={formData.code}
                    onChange={(e) => handleChange('code', e.target.value)}
                    error={errors.code}
                  />
                  <Input
                    label="Description"
                    placeholder="Brief description"
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                  />
                </div>
              </div>

              {/* Timings */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Timings</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input
                    label="Start Time *"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleChange('startTime', e.target.value)}
                    error={errors.startTime}
                  />
                  <Input
                    label="End Time *"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleChange('endTime', e.target.value)}
                    error={errors.endTime}
                  />
                  <Input
                    label="Break Start"
                    type="time"
                    value={formData.breakStart}
                    onChange={(e) => handleChange('breakStart', e.target.value)}
                  />
                  <Input
                    label="Break End"
                    type="time"
                    value={formData.breakEnd}
                    onChange={(e) => handleChange('breakEnd', e.target.value)}
                  />
                </div>
              </div>

              {/* Allowances */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Allowances & Limits</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input
                    label="Grace Time (mins)"
                    type="number"
                    value={formData.graceTime}
                    onChange={(e) => handleChange('graceTime', e.target.value)}
                  />
                  <Input
                    label="Late Allowance (mins)"
                    type="number"
                    value={formData.lateAllowance}
                    onChange={(e) => handleChange('lateAllowance', e.target.value)}
                  />
                  <Input
                    label="Early Exit (mins)"
                    type="number"
                    value={formData.earlyExitAllowance}
                    onChange={(e) => handleChange('earlyExitAllowance', e.target.value)}
                  />
                  <Input
                    label="Weekly Off"
                    value={formData.weeklyOff}
                    onChange={(e) => handleChange('weeklyOff', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <Input
                    label="Min Working Hours"
                    type="number"
                    step="0.5"
                    value={formData.minWorkingHours}
                    onChange={(e) => handleChange('minWorkingHours', e.target.value)}
                  />
                  <Input
                    label="Max Working Hours"
                    type="number"
                    step="0.5"
                    value={formData.maxWorkingHours}
                    onChange={(e) => handleChange('maxWorkingHours', e.target.value)}
                  />
                </div>
              </div>

              {/* Working Days */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">Working Days</h4>
                  {errors.workingDays && (
                    <span className="text-xs text-red-500">{errors.workingDays}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDayToggle(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        formData.workingDays[key]
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Shift Settings</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'isNightShift', label: 'Night Shift' },
                    { key: 'isFlexible', label: 'Flexible Shift' },
                    { key: 'crossMidnight', label: 'Cross Midnight' },
                    { key: 'allowOvertime', label: 'Allow Overtime' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleChange(key, !formData[key])}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${
                        formData[key]
                          ? 'border-primary bg-primary-50 text-primary'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-10 h-6 rounded-full transition-colors relative ${
                        formData[key] ? 'bg-primary' : 'bg-gray-300'
                      }`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                          formData[key] ? 'left-5' : 'left-1'
                        }`} />
                      </div>
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            /* Bulk Assignment Tab */
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Bulk Shift Assignment</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Select
                    label="Select Shift"
                    placeholder="Choose a shift"
                    options={shifts}
                    value={bulkData.shiftId}
                    onChange={(e) => handleBulkChange('shiftId', e.target.value)}
                  />
                  <Input
                    label="Start Date"
                    type="date"
                    value={bulkData.startDate}
                    onChange={(e) => handleBulkChange('startDate', e.target.value)}
                  />
                  <Input
                    label="End Date"
                    type="date"
                    value={bulkData.endDate}
                    onChange={(e) => handleBulkChange('endDate', e.target.value)}
                  />
                </div>
                <Select
                  label="Filter by Department"
                  placeholder="All Departments"
                  options={[
                    { id: '', name: 'All Departments' },
                    { id: 'Engineering', name: 'Engineering' },
                    { id: 'Design', name: 'Design' },
                    { id: 'HR', name: 'HR' },
                    { id: 'Marketing', name: 'Marketing' },
                    { id: 'Finance', name: 'Finance' },
                    { id: 'Sales', name: 'Sales' },
                  ]}
                  value={bulkData.departmentFilter}
                  onChange={(e) => handleBulkChange('departmentFilter', e.target.value)}
                />
              </div>

              {/* Employee Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">Select Employees</h4>
                  <button
                    type="button"
                    onClick={handleSelectAllEmployees}
                    className="text-xs text-primary hover:text-primary-dark font-medium"
                  >
                    {bulkData.employeeIds.length === employees.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                  {employees.map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggleEmployee(emp.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-all ${
                        bulkData.employeeIds.includes(emp.id)
                          ? 'bg-primary-50 border border-primary text-primary'
                          : 'bg-gray-50 border border-gray-100 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-medium">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="truncate">{emp.name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {bulkData.employeeIds.length} employee(s) selected
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleBulkAssign}
                icon={<Users className="h-4 w-4" />}
              >
                Assign Bulk Shift
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="sticky bottom-0 bg-white border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1" />
          {activeTab === 'create' && (
            <>
              <Button variant="secondary" onClick={() => setFormData({
                name: '', code: '', description: '', startTime: '09:00', endTime: '18:00',
                breakStart: '13:00', breakEnd: '14:00', graceTime: '15', lateAllowance: '30',
                earlyExitAllowance: '15', minWorkingHours: '8', maxWorkingHours: '10',
                weeklyOff: 'Friday',
                workingDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: false, saturday: false, sunday: false },
                isNightShift: false, isFlexible: false, crossMidnight: false, allowOvertime: true,
              })} icon={<RotateCcw className="h-4 w-4" />}>
                Reset
              </Button>
              <Button variant="primary" onClick={handleSubmit} icon={<Save className="h-4 w-4" />}>
                Create Shift
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}