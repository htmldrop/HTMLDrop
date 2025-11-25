import express from 'express'
import path from 'path'
import en_US from '../../translations/en_US.mjs'

export default (context) => {
  const router = express.Router({ mergeParams: true })

  /**
   * @openapi
   * /translate/{lang}:
   *   get:
   *     tags:
   *       - Translations
   *     summary: Get translations for a language
   *     description: Retrieve translation strings for a specific language code. Always includes en_US as fallback.
   *     parameters:
   *       - in: path
   *         name: lang
   *         required: true
   *         schema:
   *           type: string
   *         description: Language code (e.g., en_US, nb_NO, es_ES)
   *         example: nb_NO
   *     responses:
   *       200:
   *         description: Translation data retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 en_US:
   *                   type: object
   *                   description: English fallback translations
   *                   additionalProperties:
   *                     type: string
   *                   example:
   *                     welcome: "Welcome"
   *                     save: "Save"
   *                 requested_language:
   *                   type: object
   *                   description: Requested language translations (if available)
   *                   additionalProperties:
   *                     type: string
   *             example:
   *               en_US:
   *                 welcome: "Welcome"
   *                 save: "Save"
   *               nb_NO:
   *                 welcome: "Velkommen"
   *                 save: "Lagre"
   */
  router.get('/:lang', async (req, res) => {
    const translations = { en_US } // Always provide en_US as a fallback
    try {
      const dir = path.resolve(`./core/translations/${  req.params.lang  }.mjs`)
      translations[req.params.lang] = (await import(dir)).default
    } catch (e) {}
    res.json(translations)
  })

  return router
}
