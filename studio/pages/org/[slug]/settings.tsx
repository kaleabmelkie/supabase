import { Tabs } from 'ui'
import { observer, useLocalObservable } from 'mobx-react-lite'
import { useRouter } from 'next/router'
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react'

import { Member, NextPageWithLayout, Organization, Project, Role, User } from 'types'
import {
  useFlag,
  useOrganizationDetail,
  useOrganizationRoles,
  useStore,
  withAuth,
  useParams,
} from 'hooks'
import { AccountLayoutWithoutAuth } from 'components/layouts'
import {
  GeneralSettings,
  TeamSettings,
  BillingSettings,
  InvoicesSettings,
} from 'components/interfaces/Organization'

export const PageContext = createContext(null)

const OrgSettingsLayout = withAuth(
  observer<PropsWithChildren<{}>>(({ children }) => {
    const { app, ui } = useStore()
    const router = useRouter()
    const { slug } = useParams()

    const { roles: allRoles } = useOrganizationRoles(slug)
    const enableBillingOnlyReadOnly = useFlag('enableBillingOnlyReadOnlyRoles')
    const roles = enableBillingOnlyReadOnly
      ? allRoles
      : (allRoles ?? []).filter((role) =>
          ['Owner', 'Administrator', 'Developer'].includes(role.name)
        )

    // [Refactor] Eventually move away from useLocalObservable
    const PageState: any = useLocalObservable(() => ({
      user: {} as User,
      organization: {} as Organization,
      projects: [] as Project[],
      members: [] as Member[],
      roles: [] as Role[],
      membersFilterString: '',

      get filteredMembers() {
        const temp = !this.membersFilterString
          ? this.members
          : this.members.filter((x: any) => {
              if (x.invited_at) {
                return x.primary_email.includes(this.membersFilterString)
              }
              if (x.id || x.gotrue_id) {
                return (
                  x.username.includes(this.membersFilterString) ||
                  x.primary_email.includes(this.membersFilterString)
                )
              }
            })
        return temp.slice().sort((a: any, b: any) => a.username.localeCompare(b.username))
      },
      initData(organization: Organization, user: User, projects: Project[], roles: Role[]) {
        this.user = user
        this.projects = projects
        this.organization = organization
        this.roles = roles
      },
      onOrgUpdated(updatedOrg: any) {
        app.onOrgUpdated(updatedOrg)
      },
      onOrgDeleted() {
        app.onOrgDeleted(this.organization)
      },
    }))

    useEffect(() => {
      // User added a new payment method
      if (router.query.setup_intent && router.query.redirect_status) {
        ui.setNotification({
          category: 'success',
          message: 'Successfully added new payment method',
        })
      }
    }, [router.query])

    useEffect(() => {
      const user = ui.profile
      const organization = ui.selectedOrganization
      const projects = app.projects.list((x: Project) => x.organization_id == organization?.id)
      PageState.initData(organization, user, projects, roles)
    }, [ui.selectedOrganization, ui.profile, roles])

    return (
      <AccountLayoutWithoutAuth
        title={PageState.organization?.name || 'Supabase'}
        breadcrumbs={[
          {
            key: `org-settings`,
            label: 'Settings',
          },
        ]}
      >
        <PageContext.Provider value={PageState}>{children}</PageContext.Provider>
      </AccountLayoutWithoutAuth>
    )
  })
)

const OrganizationSettings: NextPageWithLayout = () => {
  const router = useRouter()
  const { slug } = useParams()
  const PageState: any = useContext(PageContext)
  const { ui, app } = useStore()
  const [selectedTab, setSelectedTab] = useState('GENERAL')
  const { members, isError: isOrgDetailError } = useOrganizationDetail(slug || '')
  const hash = router.asPath.split('#')[1]?.toUpperCase()

  useEffect(() => {
    if (hash) {
      setSelectedTab(hash)
    }
  }, [hash])

  function handleChangeTab(id: string) {
    if (!slug) {
      // The user should not see this error as the page should
      // be rerendered with the value of slug before they can click.
      // It is just here in case they are the flash.
      return ui.setNotification({
        category: 'error',
        message: 'Could not navigate to organization settings, please try again or contact support',
      })
    }

    setSelectedTab(id)
    router.push({
      pathname: `/org/[slug]/settings`,
      query: { slug },
      hash: id.toLowerCase(),
    })
  }

  useEffect(() => {
    if (!isOrgDetailError) {
      PageState.members = members ?? []
    }
  }, [members, isOrgDetailError])

  if (!ui.selectedOrganization || !PageState.organization) return <div />

  const organization = ui.selectedOrganization
  const projects = app.projects.list((x: Project) => x.organization_id == organization?.id)

  return (
    <div className="p-4 pt-0">
      <div className="space-y-3">
        <section className="mt-4">
          <h1 className="text-3xl">{organization?.name || 'Organization'} settings</h1>
        </section>
        <nav className="">
          <Tabs onChange={(id: string) => handleChangeTab(id)} type="underlined">
            <Tabs.Panel id="GENERAL" label="General" />
            <Tabs.Panel id="TEAM" label="Team" />
            <Tabs.Panel id="BILLING" label="Billing" />
            <Tabs.Panel id="INVOICES" label="Invoices" />
          </Tabs>
        </nav>
      </div>

      <div className="mb-8">
        {selectedTab == 'GENERAL' ? (
          <GeneralSettings />
        ) : selectedTab == 'TEAM' ? (
          <TeamSettings />
        ) : selectedTab == 'BILLING' ? (
          <BillingSettings organization={organization} projects={projects} />
        ) : selectedTab == 'INVOICES' ? (
          <InvoicesSettings organization={organization} />
        ) : null}
      </div>
    </div>
  )
}

OrganizationSettings.getLayout = (page) => <OrgSettingsLayout>{page}</OrgSettingsLayout>

export default observer(OrganizationSettings)
