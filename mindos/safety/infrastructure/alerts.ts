/**
 * MindOS Safety Alert Manager & Operational Alerting
 * Authority: Volumes I, V & Appendices B / E
 * 
 * Rules:
 * - Alerts for critical action failures, SLA breaches, expired resource delivery, and unauthorized overrides.
 * - Alerts contain operational context without exposing raw conversational PII.
 */

export interface SafetyAlert {
  id?: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  context?: Record<string, unknown>;
  timestamp?: string;
}

export class SafetyAlertManager {
  private static alerts: SafetyAlert[] = [];
  private static listeners: Array<(alert: SafetyAlert) => void> = [];

  public static raiseAlert(alert: SafetyAlert): void {
    const enriched: SafetyAlert = {
      ...alert,
      id: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: alert.timestamp || new Date().toISOString()
    };

    SafetyAlertManager.alerts.push(enriched);

    // Keep memory bounded
    if (SafetyAlertManager.alerts.length > 500) {
      SafetyAlertManager.alerts.shift();
    }

    for (const listener of SafetyAlertManager.listeners) {
      try {
        listener(enriched);
      } catch (err) {
        // Suppress listener error to prevent cascading failure
      }
    }
  }

  public static getAlerts(severity?: string): SafetyAlert[] {
    if (!severity) return [...SafetyAlertManager.alerts];
    return SafetyAlertManager.alerts.filter(a => a.severity === severity);
  }

  public static onAlert(listener: (alert: SafetyAlert) => void): () => void {
    SafetyAlertManager.listeners.push(listener);
    return () => {
      SafetyAlertManager.listeners = SafetyAlertManager.listeners.filter(l => l !== listener);
    };
  }

  public static clearAlerts(): void {
    SafetyAlertManager.alerts = [];
  }
}
