import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import Button from '../ui/Button';
import { ChevronDown, ChevronUp, MoreHorizontal, Eye, Edit, Copy, Trash2, History, Search, ArrowUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function RosterGrid({ employees, shifts, assignments, currentDate, onCellClick, onDeleteAssignment }) {
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get first day of month for empty cells
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Get employee assignment for a specific day
  const getAssignmentForDay = (employeeId, day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return assignments.find(a => a.employeeId === employeeId && a.date === dateStr);
  };

  // Get shift color
  const getShiftStyle = (shiftId) => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return null;
    return {
      backgroundColor: shift.color + '20',
      color: shift.color,
      borderLeft: `3px solid ${shift.color}`,
    };
  };

  // Filter and sort employees
  const filteredEmployees = useMemo(() => {
    let filtered = [...employees];
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => 
        e.id.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q)
      );
    }

    if (sortField) {
      filtered.sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [employees, searchQuery, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleView = (employee) => {
    // View employee details
  };

  const handleEdit = (employee) => {
    // Edit employee assignments
  };

  const handleDuplicate = (employee) => {
    // Duplicate employee's shift pattern
  };

  const handleHistory = (employee) => {
    // Show shift history
  };

  const SortHeader = ({ field, children, className }) => (
    <th
      className={cn(
        'px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap',
        className
      )}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </div>
    </th>
  );

  return (
    <Card className="overflow-hidden">
      {/* Search and Pagination bar */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Show</span>
          <select
            value={itemsPerPage}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>entries</span>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto scrollbar-thin">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <SortHeader field="id" className="sticky left-0 bg-gray-50 z-20 min-w-[100px]">Employee ID</SortHeader>
                <SortHeader field="name" className="min-w-[160px]">Employee Name</SortHeader>
                <SortHeader field="department" className="min-w-[120px]">Department</SortHeader>
                <SortHeader field="position" className="min-w-[140px]">Position</SortHeader>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const date = new Date(year, month, day);
                  const dayName = weekDays[date.getDay()];
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isWeekend = date.getDay() === 5 || date.getDay() === 6;
                  return (
                    <th
                      key={day}
                      className={cn(
                        'px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[40px]',
                        isToday ? 'text-primary bg-primary-50' : isWeekend ? 'text-gray-400' : 'text-gray-500',
                      )}
                    >
                      <div>{day}</div>
                      <div className="text-[10px] font-normal">{dayName}</div>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center sticky right-0 bg-gray-50 z-20 min-w-[80px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedEmployees.map((employee, rowIndex) => (
                <tr
                  key={employee.id}
                  className={cn(
                    'hover:bg-gray-50 transition-colors duration-150 group',
                    rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  )}
                >
                  <td className="px-3 py-3 text-sm font-mono text-gray-500 sticky left-0 bg-inherit z-10">
                    {employee.id}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
                        {employee.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{employee.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">{employee.department}</td>
                  <td className="px-3 py-3 text-sm text-gray-500">{employee.position}</td>
                  
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const assignment = getAssignmentForDay(employee.id, day);
                    const date = new Date(year, month, day);
                    const isWeekend = date.getDay() === 5 || date.getDay() === 6;
                    const isToday = date.toDateString() === new Date().toDateString();
                    
                    return (
                      <td
                        key={day}
                        onClick={() => onCellClick(employee.id, day)}
                        className={cn(
                          'px-2 py-2 text-center cursor-pointer transition-all duration-150 border-l border-gray-50',
                          'hover:bg-gray-100 hover:shadow-inner',
                          isToday && 'ring-2 ring-primary/20 ring-inset',
                        )}
                      >
                        {assignment ? (
                          <div
                            className="px-1.5 py-1 rounded-md text-[11px] font-medium truncate max-w-[60px] mx-auto"
                            style={getShiftStyle(assignment.shiftId)}
                          >
                            {shifts.find(s => s.id === assignment.shiftId)?.code || 'N/A'}
                          </div>
                        ) : isWeekend ? (
                          <div className="w-full h-full min-h-[24px] flex items-center justify-center">
                            <span className="text-[10px] text-gray-300 font-medium">OFF</span>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}

                  <td className="px-3 py-3 text-center sticky right-0 bg-inherit z-10">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === employee.id ? null : employee.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                      </button>
                      {openMenuId === employee.id && (
                        <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-fade-in">
                          <button
                            onClick={() => { handleView(employee); setOpenMenuId(null); }}
                            className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            onClick={() => { handleEdit(employee); setOpenMenuId(null); }}
                            className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => { handleDuplicate(employee); setOpenMenuId(null); }}
                            className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Copy className="h-3.5 w-3.5" /> Duplicate
                          </button>
                          <button
                            onClick={() => { onDeleteAssignment(employee.id); setOpenMenuId(null); }}
                            className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                          <button
                            onClick={() => { handleHistory(employee); setOpenMenuId(null); }}
                            className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <History className="h-3.5 w-3.5" /> History
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length} entries
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else {
              const start = Math.max(1, currentPage - 2);
              pageNum = start + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === pageNum
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Legend:</span>
          {shifts.map(shift => (
            <div key={shift.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: shift.color }} />
              <span className="text-xs text-gray-600">{shift.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gray-200" />
            <span className="text-xs text-gray-600">Weekly Off</span>
          </div>
        </div>
      </div>
    </Card>
  );
}