import fs from 'fs'
import { parse } from '@vue/compiler-sfc'

export default (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { descriptor } = parse(content)
    const template = descriptor.template.content
    const script = descriptor.script?.content
    const scriptSetup = descriptor.scriptSetup?.content // TODO
    const styles = descriptor.styles

    let obj = ''
    let imports = ''
    let index
    if (script.includes('export default')) {
      const split = script.split('export default')
      imports = split[0]
      obj = split[1]
      index = obj.indexOf('{')
      obj = obj.slice(0, index) + obj.slice(index + 1)
      index = obj.lastIndexOf('}')
      obj = obj.slice(0, index) + obj.slice(index + 1)
    }

    let setup = ''
    if (scriptSetup) {
      setup = `setup() { ${scriptSetup} },`
    }

    let css = ''
    for (const style of styles) {
      css += `${style.content  }\n`
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
    console.log(e)
    return `
            export default {
                template: \`${e.message}\`
            }
        `.trim()
  }
}
