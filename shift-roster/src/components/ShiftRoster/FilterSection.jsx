import React from 'react';
import { Card, CardContent } from '../ui/Card';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Search, RotateCcw, Filter } from 'lucide-react';

export default function FilterSection({ filters, onFilterChange, onSearch, onReset }) {
  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "assigned", label: "Assigned" },
    { value: "unassigned", label: "Unassigned" },
    { value: "leave", label: "On Leave" },
    { value: "holiday", label: "Holiday" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <Input label="Employee" placeholder="Search by name/ID" value={filters.employee} onChange={(e) => onFilterChange('employee', e.target.value)} />
          <Input label="Department" placeholder="Filter department" value={filters.department} onChange={(e) => onFilterChange('department', e.target.value)} />
          <Input label="Designation" placeholder="Filter position" value={filters.designation} onChange={(e) => onFilterChange('designation', e.target.value)} />
          <Input label="Shift" placeholder="Filter shift" value={filters.shift} onChange={(e) => onFilterChange('shift', e.target.value)} />
          <Input label="Date Range" type="date" value={filters.dateRange} onChange={(e) => onFilterChange('dateRange', e.target.value)} />
          <Select label="Status" placeholder="All Status" options={statusOptions} value={filters.status} onChange={(e) => onFilterChange('status', e.target.value)} />
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="primary" size="sm" onClick={onSearch} icon={<Search className="h-4 w-4" />}>Search</Button>
          <Button variant="outline" size="sm" onClick={onReset} icon={<RotateCcw className="h-4 w-4" />}>Reset</Button>
        </div>
      </CardContent>
    </Card>
  );
}