// ============================================================
// AttendX v2 — Hiring Module: Resume Parser
// Pure deterministic skill, experience, and role extraction
// ============================================================

export interface ParsedResumeResult {
  extractedSkills: string[]
  estimatedExperienceYears: number
  inferredRole: string
}

export class ResumeParser {
  /**
   * Parse raw resume text into skills, experience years, and inferred role
   */
  static parse(rawText: string): ParsedResumeResult {
    const commonSkills = [
      'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
      'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Tailwind',
      'HTML', 'CSS', 'Git', 'CI/CD', 'REST API', 'Redis', 'Microservices'
    ]

    const lowerText = rawText.toLowerCase()
    const extractedSkills = commonSkills.filter(skill =>
      lowerText.includes(skill.toLowerCase())
    )

    // Regex search for experience patterns: e.g. "5 years", "6+ years"
    const expMatch = rawText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)\s*(?:of\s*)?experience/i)
    const estimatedExperienceYears = expMatch ? parseFloat(expMatch[1]) : 3.0

    let inferredRole = 'Full Stack Engineer'
    if (lowerText.includes('devops') || lowerText.includes('sre')) {
      inferredRole = 'DevOps / SRE'
    } else if (lowerText.includes('frontend') || lowerText.includes('ui')) {
      inferredRole = 'Frontend Engineer'
    } else if (lowerText.includes('backend')) {
      inferredRole = 'Backend Engineer'
    } else if (lowerText.includes('ai') || lowerText.includes('machine learning')) {
      inferredRole = 'AI / ML Engineer'
    }

    return {
      extractedSkills,
      estimatedExperienceYears,
      inferredRole,
    }
  }
}
