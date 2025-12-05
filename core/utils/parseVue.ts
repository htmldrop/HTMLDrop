import fs from 'fs'
import { parse } from '@vue/compiler-sfc'

/**
 * Find the matching closing brace for the object starting at position `start`
 * This handles nested braces, strings, template literals, regex, and comments properly
 */
function findMatchingBrace(str: string, start: number): number {
  let depth = 0
  let i = start
  const len = str.length
  let lastToken = '' // Track last significant token for regex detection

  while (i < len) {
    const char = str[i]
    const nextChar = str[i + 1]

    // Skip whitespace (but don't change lastToken)
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i++
      continue
    }

    // Skip string literals (single and double quotes)
    if (char === '"' || char === "'") {
      const quote = char
      i++
      while (i < len && str[i] !== quote) {
        if (str[i] === '\\') i++ // skip escaped char
        i++
      }
      i++
      lastToken = 'string'
      continue
    }

    // Skip template literals - must handle ${} expressions to avoid counting braces inside
    if (char === '`') {
      i++
      while (i < len && str[i] !== '`') {
        if (str[i] === '\\') {
          i += 2 // skip escaped char and next
          continue
        }
        // Handle ${} expressions - skip the entire expression including nested braces
        if (str[i] === '$' && str[i + 1] === '{') {
          i += 2 // skip ${
          let exprDepth = 1
          let exprLastToken = '{' // Track tokens for regex detection inside expressions
          while (i < len && exprDepth > 0) {
            const ec = str[i]
            // Skip whitespace
            if (ec === ' ' || ec === '\t' || ec === '\n' || ec === '\r') {
              i++
              continue
            }
            if (ec === '\\') {
              i += 2
              continue
            }
            if (ec === '{') {
              exprDepth++
              exprLastToken = '{'
            } else if (ec === '}') {
              exprDepth--
              exprLastToken = '}'
            } else if (ec === '`') {
              // Nested template literal - recursively skip it (simplified - don't handle nested ${})
              i++
              while (i < len && str[i] !== '`') {
                if (str[i] === '\\') {
                  i += 2
                  continue
                }
                i++
              }
              exprLastToken = 'string'
            } else if (ec === '"' || ec === "'") {
              // Skip string inside expression
              const q = ec
              i++
              while (i < len && str[i] !== q) {
                if (str[i] === '\\') i++
                i++
              }
              exprLastToken = 'string'
            } else if (ec === '/') {
              const nextC = str[i + 1]
              if (nextC === '/') {
                // Single-line comment inside expression
                i += 2
                while (i < len && str[i] !== '\n') i++
                continue
              } else if (nextC === '*') {
                // Multi-line comment inside expression
                i += 2
                while (i < len && !(str[i] === '*' && str[i + 1] === '/')) i++
                i += 2
                continue
              } else {
                // Could be regex or division - check context
                const canBeRegex =
                  exprLastToken === '' ||
                  exprLastToken === '(' ||
                  exprLastToken === ',' ||
                  exprLastToken === '=' ||
                  exprLastToken === ':' ||
                  exprLastToken === '[' ||
                  exprLastToken === '!' ||
                  exprLastToken === '&' ||
                  exprLastToken === '|' ||
                  exprLastToken === '?' ||
                  exprLastToken === '{' ||
                  exprLastToken === '}' ||
                  exprLastToken === ';' ||
                  exprLastToken === 'return' ||
                  exprLastToken === 'case' ||
                  exprLastToken === 'throw'

                if (canBeRegex) {
                  // Skip regex: /.../ (handle [...] character classes)
                  i++
                  while (i < len && str[i] !== '/') {
                    if (str[i] === '\\') i++ // skip escaped char
                    if (str[i] === '[') {
                      // character class - skip until ]
                      i++
                      while (i < len && str[i] !== ']') {
                        if (str[i] === '\\') i++
                        i++
                      }
                    }
                    if (str[i] === '\n') break // regex can't span lines, must be division
                    i++
                  }
                  if (str[i] === '/') i++ // skip closing /
                  // skip flags
                  while (i < len && /[gimsuy]/.test(str[i])) i++
                  exprLastToken = 'regex'
                  continue
                } else {
                  // It's division, not regex - just treat / as operator
                  exprLastToken = '/'
                }
              }
            } else if (ec === '(' || ec === ',' || ec === '=' || ec === ':' || ec === '[' || ec === ';') {
              exprLastToken = ec
            } else if (/[a-zA-Z_$]/.test(ec)) {
              // Read identifier
              let ident = ''
              while (i < len && /[a-zA-Z0-9_$]/.test(str[i])) {
                ident += str[i]
                i++
              }
              exprLastToken = ident
              continue // don't increment i again
            } else {
              exprLastToken = ec
            }
            i++
          }
          continue
        }
        i++
      }
      i++
      lastToken = 'string'
      continue
    }

    // Skip single-line comments
    if (char === '/' && nextChar === '/') {
      i += 2
      while (i < len && str[i] !== '\n') i++
      i++
      continue
    }

    // Skip multi-line comments
    if (char === '/' && nextChar === '*') {
      i += 2
      while (i < len && !(str[i] === '*' && str[i + 1] === '/')) i++
      i += 2
      continue
    }

    // Skip regex literals - they start with / but not after certain tokens
    // Regex can appear after: ( , = : [ ! & | ? { } ; or at start
    if (char === '/' && nextChar !== '/' && nextChar !== '*') {
      const canBeRegex =
        lastToken === '' ||
        lastToken === '(' ||
        lastToken === ',' ||
        lastToken === '=' ||
        lastToken === ':' ||
        lastToken === '[' ||
        lastToken === '!' ||
        lastToken === '&' ||
        lastToken === '|' ||
        lastToken === '?' ||
        lastToken === '{' ||
        lastToken === '}' ||
        lastToken === ';' ||
        lastToken === 'return' ||
        lastToken === 'case' ||
        lastToken === 'throw' ||
        lastToken === 'in' ||
        lastToken === 'of' ||
        lastToken === 'typeof' ||
        lastToken === 'instanceof' ||
        lastToken === 'new' ||
        lastToken === 'void' ||
        lastToken === 'delete'

      if (canBeRegex) {
        i++ // skip opening /
        while (i < len && str[i] !== '/') {
          if (str[i] === '\\') i++ // skip escaped char
          if (str[i] === '[') {
            // character class - skip until ]
            i++
            while (i < len && str[i] !== ']') {
              if (str[i] === '\\') i++
              i++
            }
          }
          i++
        }
        i++ // skip closing /
        // skip flags
        while (i < len && /[gimsuy]/.test(str[i])) i++
        lastToken = 'regex'
        continue
      }
    }

    // Track brace depth
    if (char === '{') {
      depth++
      lastToken = '{'
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return i
      }
      lastToken = '}'
    } else if (char === '(' || char === ',' || char === '=' || char === ':' || char === '[' || char === ';') {
      lastToken = char
    } else if (/[a-zA-Z_$]/.test(char)) {
      // Read identifier/keyword
      let ident = ''
      while (i < len && /[a-zA-Z0-9_$]/.test(str[i])) {
        ident += str[i]
        i++
      }
      lastToken = ident
      continue // don't increment i again
    } else {
      lastToken = char
    }

    i++
  }

  return -1 // No matching brace found
}

/**
 * Find the real 'export default' statement (not inside strings/comments/templates)
 * Returns the index of 'export' keyword, or -1 if not found
 */
function findRealExportDefault(str: string): number {
  let i = 0
  const len = str.length
  const target = 'export default'

  while (i < len) {
    const char = str[i]
    const nextChar = str[i + 1]

    // Skip string literals
    if (char === '"' || char === "'") {
      const quote = char
      i++
      while (i < len && str[i] !== quote) {
        if (str[i] === '\\') i++
        i++
      }
      i++
      continue
    }

    // Skip template literals
    if (char === '`') {
      i++
      while (i < len && str[i] !== '`') {
        if (str[i] === '\\') {
          i += 2
          continue
        }
        if (str[i] === '$' && str[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < len && depth > 0) {
            if (str[i] === '\\') {
              i += 2
              continue
            }
            if (str[i] === '{') depth++
            else if (str[i] === '}') depth--
            else if (str[i] === '`') break
            else if (str[i] === '"' || str[i] === "'") {
              const q = str[i]
              i++
              while (i < len && str[i] !== q) {
                if (str[i] === '\\') i++
                i++
              }
            }
            i++
          }
          continue
        }
        i++
      }
      i++
      continue
    }

    // Skip single-line comments
    if (char === '/' && nextChar === '/') {
      i += 2
      while (i < len && str[i] !== '\n') i++
      i++
      continue
    }

    // Skip multi-line comments
    if (char === '/' && nextChar === '*') {
      i += 2
      while (i < len && !(str[i] === '*' && str[i + 1] === '/')) i++
      i += 2
      continue
    }

    // Check for 'export default' at current position
    if (str.substring(i, i + target.length) === target) {
      // Make sure it's a word boundary (not part of a larger identifier)
      const charBefore = i > 0 ? str[i - 1] : ' '
      const charAfter = str[i + target.length] || ' '
      if (!/[a-zA-Z0-9_$]/.test(charBefore) && !/[a-zA-Z0-9_$]/.test(charAfter)) {
        return i
      }
    }

    i++
  }

  return -1
}

export default (filePath: string): string => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { descriptor } = parse(content)
    const template = descriptor.template?.content
    const script = descriptor.script?.content
    const scriptSetup = descriptor.scriptSetup?.content // TODO
    const styles = descriptor.styles

    let obj = ''
    let imports = ''
    if (script) {
      const exportIndex = findRealExportDefault(script)
      if (exportIndex !== -1) {
        imports = script.slice(0, exportIndex)
        const afterExport = script.slice(exportIndex + 'export default'.length)
        // Find the opening brace of the export default object
        const openBraceIndex = afterExport.indexOf('{')
        if (openBraceIndex !== -1) {
          // Find the matching closing brace
          const closeBraceIndex = findMatchingBrace(afterExport, openBraceIndex)
          if (closeBraceIndex !== -1) {
            // Extract the content between the braces (excluding the braces themselves)
            obj = afterExport.slice(openBraceIndex + 1, closeBraceIndex)
          }
        }
      }
    }

    let setup = ''
    if (scriptSetup) {
      setup = `setup() { ${scriptSetup} },`
    }

    let css = ''
    for (const style of styles) {
      css += `${style.content}\n`
    }

    return `
            ${imports}

            const id = \`${filePath}\`

            if (!document.getElementById(id)) {
                const styleTag = document.createElement('style')
                styleTag.id = id
                styleTag.textContent = \`${css}\`
                document.head.appendChild(styleTag)
            }

            export default {
                template: \`${template?.trim()}\`,
                ${setup}
                ${obj}
            }
        `.trim()
  } catch (e) {
    const error = e as Error
    console.log(error)
    return `
            export default {
                template: \`${error.message}\`
            }
        `.trim()
  }
}
