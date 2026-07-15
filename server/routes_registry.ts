import type { Express } from "express";
import { requireAuth, requireRole } from "./auth";
import {
  listDataControllers, createDataController, renewLicence,
  listProcessingRecords, createProcessingRecord,
  listDataBreaches, createDataBreach, updateDataBreach,
  listDsrRequests, createDsrRequest, updateDsrRequest,
  listDsrComplaints, createDsrComplaint,
  listComplianceAudits, createComplianceAudit, updateComplianceAudit,
  listExternalIntegrations, getExternalIntegration, createExternalIntegration, updateExternalIntegration, syncExternalIntegration,
  deleteExternalIntegration,
  listExternalIntegrationEvents,
  listDpoAppointments, createDpoAppointment, notifyDpoToAuthority, revokeDpoAppointment,
  listConsentRecords, createConsentRecord, withdrawConsent,
  listPatientIdentifiers, generatePatientIdentifier,
  listTransferRecords, createTransferRecord,
  listWhistleblowerReports, createWhistleblowerReport, updateWhistleblowerReport,
  listEnforcementCases, createEnforcementCase, updateEnforcementCase,
  listAppealCases, createAppealCase, updateAppealCase,
  listAdequacyCountries, addAdequacyCountry, removeAdequacyCountry,
  listAuthorityApprovals, decideAuthorityApproval,
} from "./services/registry";
import {
  listPrivacyNotices, createPrivacyNotice, publishPrivacyNotice,
  listProcessingNotifications, createProcessingNotification, submitProcessingNotification,
  listAuthorisationRequests, createAuthorisationRequest, decideAuthorisationRequest,
  listAdmSystems, createAdmSystem, updateAdmSystem,
  listSecurityControls, createSecurityControl, updateSecurityControl,
  listDpas, createDpa, updateDpa,
  listRepresentationRecords, createRepresentationRecord, verifyRepresentationRecord,
  listInvestigationCases, createInvestigationCase, updateInvestigationCase,
  listPublicRegisterEntries, publishToPublicRegister, removeFromPublicRegister,
  listCodesOfConduct, listPublishedCodesOfConduct, createCodeOfConduct, decideCodeOfConduct,
  listRegulationConfigs, upsertRegulationConfig,
  listPolicyNotes, createPolicyNote,
  listCrossBorderLiaisons, createCrossBorderLiaison,
  listDpoConfig, setDpoConfig,
  // GAP 1: Processor Instructions (s.17)
  listProcessorInstructions, createProcessorInstruction, revokeProcessorInstruction, acknowledgeProcessorInstruction,
  // GAP 2: Retention & Compliance Checklist (ss.7,13)
  listOverdueRetentionActivities, listComplianceChecklist, markRetentionReviewed,
  // GAP 3: Purpose Register (ss.8-9)
  listPurposes, createPurpose, checkPurposeCompatibility,
  // GAP 4: Whistleblower Notice Workflow (s.31)
  sendImplicatedPersonNotice, withholdImplicatedPersonNotice, listWhistleblowerReportsExtended,
  // GAP 5: Public DSRR (s.14)
  createPublicDsrRequest,
  // GAP 6: Exemption Decisions (s.20(4))
  listExemptionDecisions, createExemptionDecision,
} from "./services/registry-v3";
import { resolvePublicDsrTenantId } from "./services/public-dsr-tenant";
import { discoverExternalData, getDiscoveryHistory, getDiscoveredFields, triggerDiscoveryScan } from "./services/data-discovery";


function handleRouteError(res: any, error: any) {
  console.error(error);
  const status = error?.status || 500;
  const message = error?.message || "Failed";
  res.status(status).json({
    error: message,
    code: status === 400 ? "BAD_REQUEST" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR"
  });
}

export function registerRegistryRoutes(app: Express) {
  function tenantIdFromReq(req: any) {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) {
      throw Object.assign(new Error("Missing tenantId on authenticated request"), { status: 400 });
    }
    return tenantId;
  }
  // ─── Data Controllers & Processors ──────────────────────────────────────────
  app.get('/api/registry/controllers', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await listDataControllers(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/controllers', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.status(201).json(await createDataController(req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/controllers/renew/:id', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await renewLicence(req.params.id, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── ROPA Management ────────────────────────────────────────────────────────
  app.get('/api/registry/processing-records', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await listProcessingRecords(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/processing-records', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.status(201).json(await createProcessingRecord(req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── Data Breach Management ─────────────────────────────────────────────────
  app.get('/api/registry/breaches', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await listDataBreaches(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/breaches', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.status(201).json(await createDataBreach(req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/breaches/:id', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await updateDataBreach(req.params.id, req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── Data Subject Rights ────────────────────────────────────────────────────
  app.get('/api/registry/dsr-requests', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await listDsrRequests(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/dsr-requests', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.status(201).json(await createDsrRequest(req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/dsr-requests/:id', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await updateDsrRequest(req.params.id, req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.get('/api/registry/dsr-complaints', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.json(await listDsrComplaints(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/dsr-complaints', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = tenantIdFromReq(req);
      res.status(201).json(await createDsrComplaint(req.body, tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── Compliance Audits ──────────────────────────────────────────────────────
  const auditListHandler = async (req: any, res: any) => {
    try { res.json(await listComplianceAudits(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  };
  app.get('/api/registry/compliance-audits', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), auditListHandler);
  app.get('/api/registry/audits', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), auditListHandler);

  const auditCreateHandler = async (req: any, res: any) => {
    try { res.status(201).json(await createComplianceAudit(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  };
  app.post('/api/registry/compliance-audits', requireAuth, requireRole('REGULATOR'), auditCreateHandler);
  app.post('/api/registry/audits', requireAuth, requireRole('REGULATOR'), auditCreateHandler);

  const auditUpdateHandler = async (req: any, res: any) => {
    try { res.json(await updateComplianceAudit(req.params.id, req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  };
  app.patch('/api/registry/compliance-audits/:id', requireAuth, requireRole('REGULATOR'), auditUpdateHandler);
  app.patch('/api/registry/audits/:id', requireAuth, requireRole('REGULATOR'), auditUpdateHandler);

  // ─── External Integrations Feeds ────────────────────────────────────────────
  const intListHandler = async (req: any, res: any) => {
    try { res.json(await listExternalIntegrations(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  };
  app.get('/api/registry/external-integrations', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), intListHandler);
  app.get('/api/registry/integrations', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), intListHandler);

  const intSyncHandler = async (req: any, res: any) => {
    try { res.json(await syncExternalIntegration(req.params.id, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  };
  app.post('/api/registry/external-integrations/sync/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), intSyncHandler);
  app.post('/api/registry/integrations/:id/sync', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), intSyncHandler);

  app.get('/api/registry/external-integrations/:id/events', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await listExternalIntegrationEvents(req.params.id, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/registry/integrations/:id/events', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await listExternalIntegrationEvents(req.params.id, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.get('/api/registry/external-integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await getExternalIntegration(req.params.id, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/registry/integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await getExternalIntegration(req.params.id, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/external-integrations', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await createExternalIntegration(req.body, tenantIdFromReq(req), (req.user as any)?.username || 'SYSTEM')); }
    catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/integrations', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await createExternalIntegration(req.body, tenantIdFromReq(req), (req.user as any)?.username || 'SYSTEM')); }
    catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/external-integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await updateExternalIntegration(req.params.id, req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await updateExternalIntegration(req.params.id, req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.delete('/api/registry/external-integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await deleteExternalIntegration(req.params.id, tenantIdFromReq(req), (req.user as any)?.username)); }
    catch (e) { handleRouteError(res, e); }
  });
  app.delete('/api/registry/integrations/:id', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await deleteExternalIntegration(req.params.id, tenantIdFromReq(req), (req.user as any)?.username)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── DPO Appointments ────────────────────────────────────────────────────────
  app.get('/api/registry/dpos', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listDpoAppointments(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/dpos', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createDpoAppointment(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/dpos/:id/notify', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await notifyDpoToAuthority(req.params.id)); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/dpos/:id/revoke', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await revokeDpoAppointment(req.params.id)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Consent Records ─────────────────────────────────────────────────────────
  app.get('/api/registry/consents', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listConsentRecords(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/consents', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await createConsentRecord(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/consents/:id/withdraw', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.json(await withdrawConsent(req.params.id)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Patient Identifiers ─────────────────────────────────────────────────────
  app.get('/api/registry/patient-ids', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listPatientIdentifiers(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/patient-ids', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await generatePatientIdentifier(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Transfer Records (TIAs) ─────────────────────────────────────────────────
  app.get('/api/registry/transfers', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listTransferRecords(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/transfers', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await createTransferRecord(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Whistleblower Reports ───────────────────────────────────────────────────
  app.get('/api/registry/whistleblowing', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listWhistleblowerReports(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/whistleblowing', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try { res.status(201).json(await createWhistleblowerReport(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/whistleblowing/:id', requireAuth, requireRole('DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateWhistleblowerReport(req.params.id, req.body)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Enforcement Cases (Regulator only) ──────────────────────────────────────
  app.get('/api/registry/enforcements', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listEnforcementCases(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/enforcements', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await createEnforcementCase(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/enforcements/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateEnforcementCase(req.params.id, req.body)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Appeal Cases ─────────────────────────────────────────────────────────────
  app.get('/api/registry/appeals', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listAppealCases(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/appeals', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await createAppealCase(req.body, tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/appeals/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateAppealCase(req.params.id, req.body)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Adequacy Countries (Regulator manages, DPO reads) ───────────────────────
  app.get('/api/registry/adequacy', requireAuth, requireRole('DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listAdequacyCountries()); }
    catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/adequacy', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await addAdequacyCountry(req.body)); }
    catch (e) { handleRouteError(res, e); }
  });

  app.delete('/api/registry/adequacy/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await removeAdequacyCountry(req.params.id)); }
    catch (e) { handleRouteError(res, e); }
  });

  // ─── Authority Approvals ──────────────────────────────────────────────────────
  app.get('/api/registry/approvals', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listAuthorityApprovals(tenantIdFromReq(req))); }
    catch (e) { handleRouteError(res, e); }
  });

  app.patch('/api/registry/approvals/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try {
      const decidedBy = (req.user as any)?.username || "REGULATOR";
      res.json(await decideAuthorityApproval(req.params.id, req.body, decidedBy));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Privacy Notices (ss.15-16) ─────────────────────────────────────────
  app.get('/api/registry/privacy-notices', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listPrivacyNotices(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/privacy-notices', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createPrivacyNotice(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/privacy-notices/:id/publish', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await publishPrivacyNotice(req.params.id)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Processing Notifications (ss.20-22) ─────────────────────────────────
  app.get('/api/registry/notifications', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listProcessingNotifications(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/notifications', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createProcessingNotification(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/notifications/:id/submit', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await submitProcessingNotification(req.params.id)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Authorisation Requests (s.22) ───────────────────────────────────────
  app.get('/api/registry/authorisation-requests', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listAuthorisationRequests(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/authorisation-requests', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createAuthorisationRequest(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/authorisation-requests/:id/decide', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await decideAuthorisationRequest(req.params.id, req.body, (req.user as any)?.username || 'REGULATOR')); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: ADM Systems (s.25) ──────────────────────────────────────────────────
  app.get('/api/registry/adm-systems', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listAdmSystems(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/adm-systems', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createAdmSystem(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/adm-systems/:id', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await updateAdmSystem(req.params.id, req.body)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Security Controls (s.18) ────────────────────────────────────────────
  app.get('/api/registry/security-controls', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listSecurityControls(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/security-controls', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createSecurityControl(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/security-controls/:id', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateSecurityControl(req.params.id, req.body)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Data Processing Agreements (s.18(5)) ────────────────────────────────
  app.get('/api/registry/dpas', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listDpas(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/dpas', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createDpa(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/dpas/:id', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateDpa(req.params.id, req.body)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Representation Records (ss.26-27) ────────────────────────────────────
  app.get('/api/registry/representations', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listRepresentationRecords(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/representations', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createRepresentationRecord(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/representations/:id/verify', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await verifyRepresentationRecord(req.params.id, (req.user as any)?.username || 'OFFICER')); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Investigation Cases (s.6(1)(f)-(h)) ─────────────────────────────────
  app.get('/api/registry/investigations', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listInvestigationCases(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/investigations', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await createInvestigationCase(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/investigations/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await updateInvestigationCase(req.params.id, req.body)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: External Data Discovery (Regulator and DPO Workspace) ──────────────
  app.post('/api/registry/discover', requireAuth, requireRole('REGULATOR', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try {
      const userId = (req.user as any)?.id || 'unknown';
      const tenantId = tenantIdFromReq(req);
      const result = await discoverExternalData(req.body, userId, tenantId);
      res.json(result);
    } catch (e) { handleRouteError(res, e); }
  });

  app.get('/api/registry/discovery-history', requireAuth, requireRole('REGULATOR', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try {
      const userId = (req.user as any)?.id || 'unknown';
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await getDiscoveryHistory(userId, limit);
      res.json(history);
    } catch (e) { handleRouteError(res, e); }
  });

  app.get('/api/registry/discovered-fields', requireAuth, requireRole('DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || tenantIdFromReq(req);
      const system = req.query.system as string | undefined;
      const isPII = req.query.isPII === 'true';
      const isSensitive = req.query.isSensitive === 'true';
      const category = req.query.category as string | undefined;
      const searchQuery = req.query.search as string | undefined;
      
      const fields = await getDiscoveredFields(tenantId, {
        system,
        isPII,
        isSensitive,
        category,
        searchQuery,
      });
      res.json(fields);
    } catch (e) { handleRouteError(res, e); }
  });

  app.post('/api/registry/discover-scan', requireAuth, requireRole('DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || tenantIdFromReq(req);
      const { connectorInstanceId } = req.body;
      
      const result = await triggerDiscoveryScan(tenantId, connectorInstanceId);
      res.json(result);
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Public Register (s.23) ──────────────────────────────────────────────
  app.get('/api/public-register', async (_req: any, res: any) => { // No auth — public
    try { res.json(await listPublicRegisterEntries()); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/public-register', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await publishToPublicRegister(req.body, (req.user as any)?.username || 'REGISTRAR')); } catch (e) { handleRouteError(res, e); }
  });
  app.delete('/api/registry/public-register/:id', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await removeFromPublicRegister(req.params.id)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Codes of Conduct (s.30) ─────────────────────────────────────────────
  app.get('/api/registry/codes-of-conduct', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listCodesOfConduct(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/public/codes-of-conduct', async (_req: any, res: any) => { // Public code library
    try { res.json(await listPublishedCodesOfConduct()); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/codes-of-conduct', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createCodeOfConduct(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.patch('/api/registry/codes-of-conduct/:id/decide', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await decideCodeOfConduct(req.params.id, req.body, (req.user as any)?.username || 'REGULATOR')); } catch (e) { handleRouteError(res, e); }
  });

  // ─── v3: Regulation Config (s.32) ────────────────────────────────────────────
  app.get('/api/registry/regulation-config', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
    try { res.json(await listRegulationConfigs()); } catch (e) { handleRouteError(res, e); }
  });
  app.put('/api/registry/regulation-config', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await upsertRegulationConfig(req.body, (req.user as any)?.username || 'ADMIN')); } catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/registry/dpo-config', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (_req: any, res: any) => {
    try { res.json(await listDpoConfig()); } catch (e) { handleRouteError(res, e); }
  });
  app.put('/api/registry/dpo-config', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'DATA_CONTROLLER', 'DATA_PROTECTION_OFFICER'), async (req: any, res: any) => {
    try {
      const configs = Array.isArray(req.body.configs) ? req.body.configs : [];
      if (configs.length === 0) {
        return res.status(400).json({ error: 'configs is required and must be an array' });
      }
      res.json(await setDpoConfig(configs, (req.user as any)?.username || 'system'));
    } catch (e) { handleRouteError(res, e); }
  });
  // ─── v3: Policy Notes & Cross-Border Liaison (s.6(1)(i)-(j)) ─────────────────
  app.get('/api/registry/policy-notes', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listPolicyNotes(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/policy-notes', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await createPolicyNote(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/registry/cross-border-liaisons', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listCrossBorderLiaisons(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/cross-border-liaisons', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.status(201).json(await createCrossBorderLiaison(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 1: Processor Instructions (s.17) ─────────────────────────────────────
  app.get('/api/registry/processor-instructions', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listProcessorInstructions(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/processor-instructions', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createProcessorInstruction(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/processor-instructions/:id/revoke', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await revokeProcessorInstruction(req.params.id)); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/processor-instructions/:id/acknowledge', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await acknowledgeProcessorInstruction(req.params.id, (req.user as any)?.username || 'PROCESSOR')); } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 2: Retention Overdue & Compliance Checklist (ss.7,13) ────────────────
  app.get('/api/registry/retention-overdue', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listOverdueRetentionActivities(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.get('/api/registry/compliance-checklist', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listComplianceChecklist(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/processing-records/:id/review-retention', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.json(await markRetentionReviewed(req.params.id, req.body.newExpiryDate)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 3: Purpose Register (ss.8-9) ─────────────────────────────────────────
  app.get('/api/registry/purposes', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listPurposes(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/purposes', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try { res.status(201).json(await createPurpose(req.body, tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/purposes/compatibility-check', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await checkPurposeCompatibility(req.body.originalPurposeId, req.body.newPurposeDescription)); } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 4: Whistleblower Notice Workflow (s.31) ──────────────────────────────
  app.get('/api/registry/whistleblowing/extended', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listWhistleblowerReportsExtended(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/whistleblowing/:id/notify-implicated', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try { res.json(await sendImplicatedPersonNotice(req.params.id, (req.user as any)?.username || 'DPO')); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/whistleblowing/:id/withhold-notice', requireAuth, requireRole('DATA_CONTROLLER', 'REGULATOR'), async (req: any, res: any) => {
    try {
      const { reason, reviewByDate } = req.body;
      res.json(await withholdImplicatedPersonNotice(req.params.id, reason, reviewByDate, (req.user as any)?.username || 'DPO'));
    } catch (e) { handleRouteError(res, e); }
  });

  app.get('/api/public/controllers', async (req: any, res: any) => {
    try {
      const tenantId = resolvePublicDsrTenantId((req.query || {}) as Record<string, unknown>);
      res.json(await listDataControllers(tenantId));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 5: Public DSRR Intake (s.14) — NO AUTH REQUIRED ─────────────────────
  app.post('/api/public/dsrr', async (req: any, res: any) => {
    try {
      const tenantId = resolvePublicDsrTenantId(req.body || {});
      if (!tenantId) {
        return res.status(400).json({ error: 'Missing tenantId in public DSRR request' });
      }
      res.status(201).json(await createPublicDsrRequest({ ...req.body, tenantId }));
    } catch (e) { handleRouteError(res, e); }
  });

  // ─── GAP 6: Exemption Eligibility Calculator (s.20(4)) ───────────────────────
  app.get('/api/registry/exemption-decisions', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try { res.json(await listExemptionDecisions(tenantIdFromReq(req))); } catch (e) { handleRouteError(res, e); }
  });
  app.post('/api/registry/exemption-decisions', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
    try {
      const decidedBy = (req.user as any)?.username || 'REGISTRAR';
      res.status(201).json(await createExemptionDecision(req.body, tenantIdFromReq(req), decidedBy));
    } catch (e) { handleRouteError(res, e); }
  });
}
