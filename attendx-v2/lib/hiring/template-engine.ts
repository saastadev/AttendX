// ============================================================
// AttendX v2 — Hiring Module: Template Personalization Engine
// Pure variable interpolation for outreach messages and notifications
// ============================================================

export class TemplateEngine {
  /**
   * Replaces {{variable}} placeholders with candidate and role values
   */
  static interpolate(
    templateText: string,
    variables: Record<string, string | number | undefined>
  ): string {
    let result = templateText
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi')
      result = result.replace(regex, String(value ?? ''))
    }
    return result
  }

  /**
   * Alias for interpolate
   */
  static render(
    templateText: string,
    variables: Record<string, string | number | undefined>
  ): string {
    return this.interpolate(templateText, variables)
  }
}
