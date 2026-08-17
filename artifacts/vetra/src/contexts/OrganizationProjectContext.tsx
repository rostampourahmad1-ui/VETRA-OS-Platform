import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Organization = { id: number; name: string };
type Project = { id: number; name: string; organizationId?: number };
type OrganizationProjectContextValue = {
  organization: Organization | null;
  project: Project | null;
  setOrganization: (organization: Organization | null) => void;
  setProject: (project: Project | null) => void;
};

const OrganizationProjectContext = createContext<OrganizationProjectContextValue | null>(null);

export function OrganizationProjectProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganizationState] = useState<Organization | null>(() => JSON.parse(localStorage.getItem('vetra-organization') || 'null'));
  const [project, setProjectState] = useState<Project | null>(() => JSON.parse(localStorage.getItem('vetra-project') || 'null'));
  const setOrganization = (value: Organization | null) => { setOrganizationState(value); value ? localStorage.setItem('vetra-organization', JSON.stringify(value)) : localStorage.removeItem('vetra-organization'); };
  const setProject = (value: Project | null) => { setProjectState(value); value ? localStorage.setItem('vetra-project', JSON.stringify(value)) : localStorage.removeItem('vetra-project'); };
  const value = useMemo(() => ({ organization, project, setOrganization, setProject }), [organization, project]);
  return <OrganizationProjectContext.Provider value={value}>{children}</OrganizationProjectContext.Provider>;
}

export function useOrganizationProject() {
  const context = useContext(OrganizationProjectContext);
  if (!context) throw new Error('useOrganizationProject must be used within OrganizationProjectProvider');
  return context;
}
