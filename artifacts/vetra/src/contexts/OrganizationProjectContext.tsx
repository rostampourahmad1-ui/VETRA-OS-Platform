import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Organization = { id: number; name: string };
export type Project = { id: number; name: string; organizationId?: number };

type OrganizationProjectContextValue = {
  organization: Organization | null;
  project: Project | null;
  hasContext: boolean;
  setOrganization: (organization: Organization | null) => void;
  setProject: (project: Project | null) => void;
  clearContext: () => void;
};

const ORGANIZATION_STORAGE_KEY = 'vetra-organization';
const PROJECT_STORAGE_KEY = 'vetra-project';
const OrganizationProjectContext = createContext<OrganizationProjectContextValue | null>(null);

function readStored<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function persist(key: string, value: unknown | null) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  else localStorage.removeItem(key);
}

export function OrganizationProjectProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganizationState] = useState<Organization | null>(() => readStored<Organization>(ORGANIZATION_STORAGE_KEY));
  const [project, setProjectState] = useState<Project | null>(() => readStored<Project>(PROJECT_STORAGE_KEY));

  const setOrganization = (value: Organization | null) => {
    const organizationChanged = organization?.id !== value?.id;
    setOrganizationState(value);
    persist(ORGANIZATION_STORAGE_KEY, value);
    if (organizationChanged) {
      setProjectState(null);
      persist(PROJECT_STORAGE_KEY, null);
    }
  };

  const setProject = (value: Project | null) => {
    const validProject = value && organization && value.organizationId && value.organizationId !== organization.id
      ? null
      : value;
    setProjectState(validProject);
    persist(PROJECT_STORAGE_KEY, validProject);
  };

  const clearContext = () => {
    setOrganizationState(null);
    setProjectState(null);
    persist(ORGANIZATION_STORAGE_KEY, null);
    persist(PROJECT_STORAGE_KEY, null);
  };

  const contextValue = useMemo(
    () => ({ organization, project, hasContext: Boolean(organization && project), setOrganization, setProject, clearContext }),
    [organization, project],
  );

  return <OrganizationProjectContext.Provider value={contextValue}>{children}</OrganizationProjectContext.Provider>;
}

export function useOrganizationProject() {
  const context = useContext(OrganizationProjectContext);
  if (!context) throw new Error('useOrganizationProject must be used within OrganizationProjectProvider');
  return context;
}
