import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import FilterSection from './FilterSection';
import ShiftCreationForm from './ShiftCreationForm';
import RosterGrid from './RosterGrid';
import SummaryPanel from './SummaryPanel';
import ShiftEditor from './ShiftEditor';
import { mockEmployees, mockShifts, mockShiftAssignments } from '../../data/mockData';
import { Plus, Upload, Download, Calendar, ChevronLeft, ChevronRight, Clock, Users, FileSpreadsheet, Printer, Moon, Sun } from 'lucide-react';

export default function ShiftRosterPage() {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showShiftEditor, setShowShiftEditor] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [assignments, setAssignments] = useState(mockShiftAssignments);
  const [shifts, setShifts] = useState(mockShifts);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [filters, setFilters] = useState({
    company: '',
    branch: '',
    department: '',
    designation: '',
    employee: '',
    shift: '',
    dateRange: '',
    status: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => {
    addToast('Filters applied successfully', 'success');
  };

  const handleReset = () => {
    setFilters({
      company: '',
      branch: '',
      department: '',
      designation: '',
      employee: '',
      shift: '',
      dateRange: '',
      status: '',
    });
    addToast('Filters reset', 'info');
  };

  const handleCreateShift = (shiftData) => {
    const newShift = {
      ...shiftData,
      id: `SHIFT${String(shifts.length + 1).padStart(3, '0')}`,
    };
    setShifts(prev => [...prev, newShift]);
    setShowCreateForm(false);
    addToast('Shift created successfully', 'success');
  };

  const handleCellClick = (employeeId, day) => {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = assignments.find(
      a => a.employeeId === employeeId && a.date === date
    );
    setSelectedCell({ employeeId, day, date, existingAssignment: existing });
    setShowShiftEditor(true);
  };

  const handleAssignShift = (assignmentData) => {
    // Validation checks
    const { employeeId, date, shiftId } = assignmentData;

    // Check duplicate
    const duplicate = assignments.find(
      a => a.employeeId === employeeId && a.date === date && a.shiftId === shiftId
    );
    if (duplicate) {
      addToast('Employee already has this shift assigned for this date', 'error');
      return;
    }

    // Check overlapping shifts
    const shift = shifts.find(s => s.id === shiftId);
    const existingOnDate = assignments.filter(
      a => a.employeeId === employeeId && a.date === date
    );
    
    for (const existing of existingOnDate) {
      const existingShift = shifts.find(s => s.id === existing.shiftId);
      if (existingShift && shift) {
        if (isOverlapping(shift.startTime, shift.endTime, existingShift.startTime, existingShift.endTime)) {
          addToast('Shift overlaps with previous assignment', 'error');
          return;
        }
      }
    }

    const newAssignment = {
      id: `ASSIGN${Date.now()}`,
      ...assignmentData,
      createdAt: new Date().toISOString(),
    };
    setAssignments(prev => [...prev, newAssignment]);
    setShowShiftEditor(false);
    addToast('Shift assigned successfully', 'success');
  };

  const handleBulkAssign = (employeeIds, shiftId, startDate, endDate) => {
    const newAssignments = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      employeeIds.forEach(empId => {
        const exists = assignments.find(
          a => a.employeeId === empId && a.date === dateStr
        );
        if (!exists) {
          newAssignments.push({
            id: `ASSIGN${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            employeeId: empId,
            date: dateStr,
            shiftId,
            createdAt: new Date().toISOString(),
          });
        }
      });
    }
    
    setAssignments(prev => [...prev, ...newAssignments]);
    addToast(`Bulk assignment completed for ${employeeIds.length} employees`, 'success');
  };

  const handleCopyPreviousWeek = () => {
    const weekAgo = new Date(year, month, 1);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const prevAssignments = assignments.filter(a => {
      const aDate = new Date(a.date);
      return aDate >= weekAgo && aDate < new Date(year, month, 1);
    });
    
    const newAssignments = prevAssignments.map(a => ({
      ...a,
      id: `ASSIGN${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      date: new Date(new Date(a.date).getTime() + 7 * 86400000).toISOString().split('T')[0],
    }));
    
    setAssignments(prev => [...prev, ...newAssignments]);
    addToast('Previous week copied successfully', 'success');
  };

  const handleCopyPreviousMonth = () => {
    const prevMonth = new Date(year, month - 1, 1);
    const prevMonthAssignments = assignments.filter(a => {
      const aDate = new Date(a.date);
      return aDate.getMonth() === prevMonth.getMonth() && aDate.getFullYear() === prevMonth.getFullYear();
    });
    
    const newAssignments = prevMonthAssignments.map(a => {
      const oldDate = new Date(a.date);
      const newDate = new Date(year, month, oldDate.getDate());
      return {
        ...a,
        id: `ASSIGN${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: newDate.toISOString().split('T')[0],
      };
    });
    
    setAssignments(prev => [...prev, ...newAssignments]);
    addToast('Previous month copied successfully', 'success');
  };

  const handleExport = (format) => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      addToast(`Roster exported as ${format.toUpperCase()} successfully`, 'success');
    }, 1500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteAssignment = (assignmentId) => {
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    addToast('Assignment removed', 'info');
  };

  const handleSave = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      addToast('Shift roster saved successfully', 'success');
    }, 1500);
  };

  const handleSaveAndAssign = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setShowCreateForm(true);
      addToast('Saved. You can now assign shifts.', 'success');
    }, 1500);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <a href="#" className="hover:text-primary transition-colors">Dashboard</a>
              <span>/</span>
              <a href="#" className="hover:text-primary transition-colors">Attendance</a>
              <span>/</span>
              <span className="text-gray-900 font-medium">Shift Roster</span>
            </nav>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Employee Shift Roster</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDarkMode(!darkMode)}
              icon={darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateForm(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              Add Shift
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('excel')}
              icon={<FileSpreadsheet className="h-4 w-4" />}
            >
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('excel')}
              icon={<Download className="h-4 w-4" />}
            >
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyPreviousWeek}
              icon={<Calendar className="h-4 w-4" />}
            >
              Generate Weekly Roster
            </Button>
          </div>
        </div>

        {/* Summary Panel */}
        <SummaryPanel
          employees={mockEmployees}
          assignments={assignments}
          shifts={shifts}
          currentDate={currentDate}
        />

        {/* Filter Section */}
        <FilterSection
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onReset={handleReset}
        />

        {/* Month Navigation */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-lg font-semibold min-w-[200px] text-center">{monthName}</h2>
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopyPreviousWeek}>
                  Copy Prev Week
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopyPreviousMonth}>
                  Copy Prev Month
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePrint} icon={<Printer className="h-4 w-4" />}>
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roster Grid */}
        <RosterGrid
          employees={mockEmployees}
          shifts={shifts}
          assignments={assignments}
          currentDate={currentDate}
          onCellClick={handleCellClick}
          onDeleteAssignment={handleDeleteAssignment}
        />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="outline" onClick={() => {}}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleSaveAndAssign} isLoading={isLoading}>
            Save & Assign
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
            Save
          </Button>
        </div>
      </div>

      {/* Shift Creation Modal */}
      {showCreateForm && (
        <ShiftCreationForm
          onClose={() => setShowCreateForm(false)}
          onCreateShift={handleCreateShift}
          onBulkAssign={handleBulkAssign}
          employees={mockEmployees}
          shifts={shifts}
        />
      )}

      {/* Shift Editor Modal */}
      {showShiftEditor && selectedCell && (
        <ShiftEditor
          cell={selectedCell}
          shifts={shifts}
          employees={mockEmployees}
          onAssign={handleAssignShift}
          onDelete={handleDeleteAssignment}
          onClose={() => { setShowShiftEditor(false); setSelectedCell(null); }}
        />
      )}
    </div>
  );
}

function isOverlapping(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  
  // Handle overnight shifts
  const e1Adjusted = e1 < s1 ? e1 + 1440 : e1;
  const e2Adjusted = e2 < s2 ? e2 + 1440 : e2;
  
  return s1 < e2Adjusted && s2 < e1Adjusted;
}

function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}