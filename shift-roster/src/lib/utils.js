import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date, format = "MMM dd, yyyy") {
  if (!date) return "";
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fullMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = String(d.getDate()).padStart(2, "0");
  
  switch (format) {
    case "MMM dd, yyyy": return `${months[month]} ${day}, ${year}`;
    case "MMMM dd, yyyy": return `${fullMonths[month]} ${day}, ${year}`;
    case "yyyy-MM-dd": return `${year}-${String(month + 1).padStart(2, "0")}-${day}`;
    case "dd/MM/yyyy": return `${day}/${String(month + 1).padStart(2, "0")}/${year}`;
    default: return `${months[month]} ${day}, ${year}`;
  }
}

export function formatTime(time) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

export function generateId() {
  return `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export function getMonthData(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = [];
  
  // Previous month days
  const prevMonthDays = getDaysInMonth(year, month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: prevMonthDays - i, isCurrentMonth: false });
  }
  
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, isCurrentMonth: true });
  }
  
  // Next month days
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, isCurrentMonth: false });
  }
  
  return days;
}

export function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}