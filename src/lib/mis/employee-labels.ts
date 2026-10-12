/**
 * The manager dropdown label on the Employees screen (C6b #49): "Name (CODE · ROLE)", so two people with the
 * same name are told apart by code and by what they do. `roleLabel` is the screen's own role-to-text mapping.
 * Pure.
 */
export function managerOptionLabel(
  employee: { name: string; employeeCode: string; role: string },
  roleLabel: (role: string) => string,
): string {
  return `${employee.name} (${employee.employeeCode} · ${roleLabel(employee.role)})`;
}
