import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { AcInstall, AcInstallInfo } from '@/types/index'
import AcInstallHeader from './AcInstallHeader.vue'

const INSTALL: AcInstall = {
  path: '/steam/steamapps/common/assettocorsa',
  detectedAt: '2024-01-01T00:00:00.000Z',
  source: 'auto',
  version: '1.16',
}

const INSTALL_INFO: AcInstallInfo = {
  path: '/steam/steamapps/common/assettocorsa',
  version: '1.16',
  carCount: 42,
  trackCount: 17,
}

describe('AcInstallHeader', () => {
  it('renders install path and stats', () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: true },
    })
    expect(wrapper.text()).toContain('/steam/steamapps/common/assettocorsa')
    expect(wrapper.text()).toContain('42 cars')
    expect(wrapper.text()).toContain('17 tracks')
  })

  it('shows version badge when version present', () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: true },
    })
    expect(wrapper.text()).toContain('v1.16')
  })

  it('shows Rescan button on Windows', () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: true },
    })
    expect(wrapper.text()).toContain('Rescan')
  })

  it('hides Rescan button on non-Windows', () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: false },
    })
    expect(wrapper.text()).not.toContain('Rescan')
  })

  it('emits rescan when Rescan button clicked', async () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: true },
    })
    const rescanBtn = wrapper.findAll('button').find((b) => b.text().includes('Rescan'))
    expect(rescanBtn).toBeDefined()
    if (rescanBtn) await rescanBtn.trigger('click')
    expect(wrapper.emitted('rescan')).toBeTruthy()
  })

  it('emits change when gear button clicked', async () => {
    const wrapper = mount(AcInstallHeader, {
      props: { install: INSTALL, installInfo: INSTALL_INFO, isWindows: false },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('change')).toBeTruthy()
  })

  it('does not show version badge when version is absent', () => {
    const installNoVersion: typeof INSTALL = { ...INSTALL, version: undefined }
    const infoNoVersion: typeof INSTALL_INFO = { ...INSTALL_INFO, version: undefined }
    const wrapper = mount(AcInstallHeader, {
      props: { install: installNoVersion, installInfo: infoNoVersion, isWindows: false },
    })
    expect(wrapper.text()).not.toContain('v1.16')
  })
})
