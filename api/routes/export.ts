import { Router } from 'express';
import { exportEventsCSV, exportEventsJSON, exportFullDataJSON, getExportSummary } from '../services/exportService.js';

const router = Router();

router.get('/summary', (req, res) => {
  const { batchId } = req.query;
  const summary = getExportSummary(batchId as string | undefined);
  res.json(summary);
});

router.get('/events/csv', (req, res) => {
  const { batchId } = req.query;
  const csv = exportEventsCSV(batchId as string | undefined);
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="events_${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
});

router.get('/events/json', (req, res) => {
  const { batchId } = req.query;
  const json = exportEventsJSON(batchId as string | undefined);
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="events_${Date.now()}.json"`);
  res.send(json);
});

router.get('/full/json', (_req, res) => {
  const json = exportFullDataJSON();
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="full_data_${Date.now()}.json"`);
  res.send(json);
});

export default router;
