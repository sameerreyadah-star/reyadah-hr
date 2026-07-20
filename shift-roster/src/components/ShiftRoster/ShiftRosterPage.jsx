import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/Card';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import FilterSection from './FilterSection';
import ShiftCreationForm from './ShiftCreationForm';
import RosterGrid from './RosterGrid';
import SummaryPanel from './SummaryPanel';
import ShiftEditor from './ShiftEditor';
import { useShiftRoster } from '../../hooks/useShiftRoster';
import { fetchEmployees, fetchAssignments, saveRoster } from '../../services/api';
import { Plus, Download, Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, Printer, Moon, Sun, Loader2, AlertCircle } from 'lucide-react';

export default function ShiftRosterPage() {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showShiftEditor, setShowShiftEditor] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [filters, setFilters] = useState({
    company: '', branch: '', department: '', designation: '',
    employee: '', shift: '', dateRange: '', status: '',
  });

  const {
    employees,
    assignments,
    shifts,
    loading,
    error,
    loadData,
    handleAssignShift,
    handleDeleteAssignment,
    addShift,
    setAssignments,
  } = useShiftRoster();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Load data on mount
  useEffect(() => {
    loadData(month + 1, year);
  }, [year, month, loadData]);

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
      company: '', branch: '', department: '', designation: '',
      employee: '', shift: '', dateRange: '', status: '',
    });
    addToast('Filters reset', 'info');
  };

  const handleCreateShift = (shiftData) => {
    addShift(shiftData);
    setShowCreateForm(false);
  };

  const handleCellClick = (employeeId, day) => {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = assignments.find(
      a => a.employeeId === employeeId && a.date === date
    );
    setSelectedCell({ employeeId, day, date, existingAssignment: existing });
    setShowShiftEditor(true);
  };

  const onAssignShift = async (assignmentData) => {
    const success = await handleAssignShift(assignmentData);
    if (success) {
      setShowShiftEditor(false);
      setSelectedCell(null);
    }
  };

  const onDeleteAssignment = (assignmentId) => {
    handleDeleteAssignment(assignmentId);
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
      return { ...a, id: `ASSIGN${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, date: newDate.toISOString().split('T')[0] };
    });
    setAssignments(prev => [...prev, ...newAssignments]);
    addToast('Previous month copied successfully', 'success');
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await saveRoster(assignments);
      addToast('Shift roster saved successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save roster', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading shift roster...</p>
        </div>
      </div>
    );
  }

  if (error && employees.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Unable to Load Data</h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <p className="mt-2 text-sm text-gray-500">Please log in to the HR portal first, then refresh this page.</p>
          <Button variant="primary" className="mt-4" onClick={() => loadData(month + 1, year)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <a href="/" className="hover:text-primary transition-colors">Dashboard</a>
              <span>/</span>
              <a href="/" className="hover:text-primary transition-colors">Attendance</a>
              <span>/</span>
              <span className="text-gray-900 font-medium">Shift Roster</span>
            </nav>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Employee Shift Roster</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setDarkMode(!darkMode)}
              icon={darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} />
            <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}
              icon={<Plus className="h-4 w-4" />}>Add Shift</Button>
            <Button variant="outline" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />}>Import</Button>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />}>Export</Button>
            <Button variant="secondary" size="sm" onClick={handleCopyPreviousWeek}
              icon={<Calendar className="h-4 w-4" />}>Generate Weekly Roster</Button>
          </div>
        </div>

        {/* Summary Panel */}
        <SummaryPanel employees={employees} assignments={assignments} shifts={shifts} currentDate={currentDate} />

        {/* Filter Section */}
        <FilterSection filters={filters} onFilterChange={handleFilterChange} onSearch={handleSearch} onReset={handleReset} />

        {/* Month Navigation */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-lg font-semibold min-w-[200px] text-center">{monthName}</h2>
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopyPreviousWeek}>Copy Prev Week</Button>
                <Button variant="ghost" size="sm" onClick={handleCopyPreviousMonth}>Copy Prev Month</Button>
                <Button variant="ghost" size="sm" onClick={handlePrint} icon={<Printer className="h-4 w-4" />}>Print</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roster Grid */}
        <RosterGrid
          employees={employees}
          shifts={shifts}
          assignments={assignments}
          currentDate={currentDate}
          onCellClick={handleCellClick}
          onDeleteAssignment={onDeleteAssignment}
        />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="outline">Cancel</Button>
          <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
            Save
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <ShiftCreationForm
          onClose={() => setShowCreateForm(false)}
          onCreateShift={handleCreateShift}
          employees={employees}
          shifts={shifts}
        />
      )}

      {showShiftEditor && selectedCell && (
        <ShiftEditor
          cell={selectedCell}
          shifts={shifts}
          employees={employees}
          onAssign={onAssignShift}
          onDelete={onDeleteAssignment}
          onClose={() => { setShowShiftEditor(false); setSelectedCell(null); }}
        />
      )}
    </div>
  );
}