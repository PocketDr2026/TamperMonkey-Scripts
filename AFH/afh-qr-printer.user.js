// ==UserScript==
// @name         AFH - Available Dogs Sign PDF Generator
// @namespace    https://aforeverhome.org/
// @version      1.2.0
// @description  Create a printable PDF with one AFH dog sign per page, including a QR code to the dog's profile
// @author       Hunter Mihalick (PocketDr2026) Leslie Bloxam
// @homepageURL  https://github.com/PocketDr2026/TamperMonkey-Scripts
// @supportURL   https://github.com/PocketDr2026/TamperMonkey-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/PocketDr2026/TamperMonkey-Scripts/main/AFH/afh-qr-printer.user.js
// @downloadURL  https://raw.githubusercontent.com/PocketDr2026/TamperMonkey-Scripts/main/AFH/afh-qr-printer.user.js
// @match        https://aforeverhome.org/available-dogs*
// @match        https://www.aforeverhome.org/available-dogs*
// @require      https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // CONFIG
    // =========================================================================

    const SCRIPT_VERSION = '1.2.0';

    const BASE_URL = 'https://aforeverhome.org';
    const GALLERY_URL = `${BASE_URL}/available-dogs/`;

    // This is the PDF currently stored in your GitHub AFH folder.
    const TEMPLATE_URL =
        'https://raw.githubusercontent.com/' +
        'PocketDr2026/TamperMonkey-Scripts/' +
        'main/AFH/AFH_Roy_Template_Sample.pdf';

    const MAX_PAGES = 100;
    const REQUEST_DELAY_MS = 150;

    // =========================================================================
    // BUTTON
    // =========================================================================

    const button = document.createElement('button');

    button.id = 'afh-dog-sign-pdf-button';
    button.textContent = '🐾 Create Dog Sign PDF';

    Object.assign(button.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '999999',
        padding: '14px 20px',
        background: '#17365d',
        color: '#ffffff',
        border: '2px solid #ffffff',
        borderRadius: '10px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)'
    });

    button.addEventListener('mouseenter', () => {
        if (!button.disabled) {
            button.style.background = '#244d80';
        }
    });

    button.addEventListener('mouseleave', () => {
        if (!button.disabled) {
            button.style.background = '#17365d';
        }
    });

    document.body.appendChild(button);

    button.addEventListener('click', createDogSignPdf);

    // =========================================================================
    // MAIN
    // =========================================================================

    async function createDogSignPdf() {
        try {
            setButtonState('Finding available dogs...', true);

            if (typeof PDFLib === 'undefined') {
                throw new Error(
                    'The PDF library did not load. Refresh the page and try again.'
                );
            }

            if (typeof qrcode === 'undefined') {
                throw new Error(
                    'The QR library did not load. Refresh the page and try again.'
                );
            }

            // -----------------------------------------------------------------
            // Find all dogs.
            // -----------------------------------------------------------------

            const dogIds = await collectAllDogIds();

            if (!dogIds.length) {
                throw new Error(
                    'No available dogs were found on the AFH website.'
                );
            }

            console.log(
                `[AFH PDF] Found ${dogIds.length} available dogs.`
            );

            // -----------------------------------------------------------------
            // Read each profile.
            // -----------------------------------------------------------------

            const dogs = [];

            for (let i = 0; i < dogIds.length; i++) {
                setButtonState(
                    `Reading dog ${i + 1} of ${dogIds.length}...`,
                    true
                );

                try {
                    const dog = await getDogDetails(dogIds[i]);

                    if (dog) {
                        dogs.push(dog);
                    }
                } catch (error) {
                    console.error(
                        `[AFH PDF] Dog ${dogIds[i]} failed:`,
                        error
                    );
                }

                await sleep(REQUEST_DELAY_MS);
            }

            if (!dogs.length) {
                throw new Error(
                    'The dog listings were found, but their details could not be read.'
                );
            }

            dogs.sort((a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    { sensitivity: 'base' }
                )
            );

            // -----------------------------------------------------------------
            // Load Leslie's template from GitHub.
            // -----------------------------------------------------------------

            setButtonState('Loading Leslie’s template...', true);

            const templateBytes = await loadTemplatePdf();

            // -----------------------------------------------------------------
            // Build PDF.
            // -----------------------------------------------------------------

            setButtonState(
                `Creating ${dogs.length} dog signs...`,
                true
            );

            const pdfBytes =
                await buildCombinedPdf(
                    dogs,
                    templateBytes
                );

            // -----------------------------------------------------------------
            // Download.
            // -----------------------------------------------------------------

            const today = getLocalDateString();

            downloadPdf(
                pdfBytes,
                `AFH-Dog-Signs-${today}.pdf`
            );

            setButtonState(
                `✓ Created ${dogs.length} dog signs!`,
                true
            );

            setTimeout(() => {
                setButtonState(
                    '🐾 Create Dog Sign PDF',
                    false
                );
            }, 4000);

        } catch (error) {
            console.error(
                '[AFH PDF] Generator error:',
                error
            );

            alert(
                'AFH Dog Sign PDF Generator\n\n' +
                'There was a problem creating the PDF.\n\n' +
                (error?.message || error)
            );

            setButtonState(
                '🐾 Create Dog Sign PDF',
                false
            );
        }
    }

    // =========================================================================
    // FIND ALL AVAILABLE DOG IDS
    // =========================================================================

    async function collectAllDogIds() {
        const seenIds = new Set();

        for (
            let page = 1;
            page <= MAX_PAGES;
            page++
        ) {
            setButtonState(
                `Checking available dogs page ${page}...`,
                true
            );

            const url =
                new URL(GALLERY_URL);

            url.searchParams.set(
                'per_page',
                '9'
            );

            url.searchParams.set(
                'sort',
                'name'
            );

            url.searchParams.set(
                'sort_dir',
                'asc'
            );

            url.searchParams.set(
                'page_num',
                String(page)
            );

            const response =
                await fetch(
                    url.toString(),
                    {
                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Gallery page ${page} returned HTTP ${response.status}.`
                );
            }

            const html =
                await response.text();

            const parsed =
                new DOMParser()
                    .parseFromString(
                        html,
                        'text/html'
                    );

            const pageIds =
                extractDogIds(parsed);

            console.log(
                `[AFH PDF] Gallery page ${page}:`,
                pageIds
            );

            if (!pageIds.length) {
                break;
            }

            let newDogs = 0;

            for (const id of pageIds) {
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    newDogs++;
                }
            }

            // AFH sometimes repeats the final page if we request
            // a page beyond the end.
            if (newDogs === 0) {
                break;
            }

            await sleep(
                REQUEST_DELAY_MS
            );
        }

        return Array.from(seenIds);
    }

    // =========================================================================
    // EXTRACT DOG IDS
    // =========================================================================

    function extractDogIds(doc) {
        const ids = new Set();

        const links =
            doc.querySelectorAll(
                'a[href]'
            );

        for (const link of links) {
            const rawHref =
                link.getAttribute('href');

            if (!rawHref) {
                continue;
            }

            if (
                !rawHref.includes('afh-single')
            ) {
                continue;
            }

            try {
                const url =
                    new URL(
                        rawHref,
                        BASE_URL
                    );

                const id =
                    url.searchParams
                        .get('id');

                if (
                    id &&
                    /^\d+$/.test(id)
                ) {
                    ids.add(id);
                }

            } catch (error) {
                console.warn(
                    '[AFH PDF] Could not parse:',
                    rawHref
                );
            }
        }

        return Array.from(ids);
    }

    // =========================================================================
    // LOAD DOG PROFILE
    // =========================================================================

    async function getDogDetails(id) {
        const profileUrl =
            `${BASE_URL}/afh-single-dog/?id=${encodeURIComponent(id)}`;

        const response =
            await fetch(
                profileUrl,
                {
                    credentials:
                        'same-origin',

                    cache:
                        'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `Dog ${id} returned HTTP ${response.status}.`
            );
        }

        const html =
            await response.text();

        const parsed =
            new DOMParser()
                .parseFromString(
                    html,
                    'text/html'
                );

        // ---------------------------------------------------------------------
        // NAME
        // ---------------------------------------------------------------------

        let name =
            parsed
                .querySelector('h1')
                ?.textContent
                ?.replace(/\s+/g, ' ')
                ?.trim();

        if (!name) {
            name =
                `AFH Dog ${id}`;
        }

        // ---------------------------------------------------------------------
        // CONVERT PAGE TO CLEAN TEXT LINES
        // ---------------------------------------------------------------------

        const textLines =
            (parsed.body?.innerText || '')
                .split('\n')
                .map(line =>
                    line
                        .replace(/\s+/g, ' ')
                        .trim()
                )
                .filter(Boolean);

        let sex = '';
        let dob = '';
        let breed = '';

        // ---------------------------------------------------------------------
        // SEX + DOB
        //
        // Current AFH format:
        //
        // Male (Intact) — Date of Birth: 06/26/2026 (...)
        //
        // or
        //
        // Female (...) — Date of Birth: ...
        // ---------------------------------------------------------------------

        let detailsLineIndex = -1;

        for (
            let i = 0;
            i < textLines.length;
            i++
        ) {
            const line =
                textLines[i];

            const match =
                line.match(
                    /\b(Male|Female)\b(?:\s*\([^)]*\))?.*?Date of Birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
                );

            if (match) {
                sex =
                    match[1]
                        .toLowerCase();

                dob =
                    normalizeDate(
                        match[2]
                    );

                detailsLineIndex = i;

                break;
            }
        }

        // ---------------------------------------------------------------------
        // BREED
        //
        // On AFH profiles the breed is the next meaningful line
        // after the sex / DOB line.
        // ---------------------------------------------------------------------

        if (
            detailsLineIndex >= 0
        ) {
            for (
                let i =
                    detailsLineIndex + 1;

                i < textLines.length;

                i++
            ) {
                const candidate =
                    textLines[i];

                if (
                    candidate &&
                    candidate !== name &&
                    !candidate.startsWith(
                        'Meet '
                    ) &&
                    !candidate.startsWith(
                        'Request Info'
                    )
                ) {
                    breed =
                        candidate;

                    break;
                }
            }
        }

        // ---------------------------------------------------------------------
        // FALLBACKS
        // ---------------------------------------------------------------------

        if (!sex) {
            const fullText =
                textLines.join('\n');

            const sexMatch =
                fullText.match(
                    /\b(Male|Female)\b/i
                );

            if (sexMatch) {
                sex =
                    sexMatch[1]
                        .toLowerCase();
            }
        }

        if (!dob) {
            const fullText =
                textLines.join('\n');

            const dobMatch =
                fullText.match(
                    /Date of Birth:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
                );

            if (dobMatch) {
                dob =
                    normalizeDate(
                        dobMatch[1]
                    );
            }
        }

        if (!breed) {
            breed =
                'Breed information unavailable';
        }

        const dog = {
            id,
            name,
            breed,
            sex:
                sex || 'sex unavailable',
            dob:
                dob || 'date unavailable',
            url:
                profileUrl
        };

        console.log(
            '[AFH PDF] Dog:',
            dog
        );

        return dog;
    }

    // =========================================================================
    // LOAD TEMPLATE FROM GITHUB
    // =========================================================================

    function loadTemplatePdf() {
        return new Promise(
            (resolve, reject) => {

                GM_xmlhttpRequest({
                    method:
                        'GET',

                    url:
                        TEMPLATE_URL,

                    responseType:
                        'arraybuffer',

                    onload:
                        response => {

                            if (
                                response.status >= 200 &&
                                response.status < 300
                            ) {
                                resolve(
                                    new Uint8Array(
                                        response.response
                                    )
                                );

                                return;
                            }

                            reject(
                                new Error(
                                    'Could not download the PDF template from GitHub. ' +
                                    `HTTP ${response.status}`
                                )
                            );
                        },

                    onerror:
                        error => {

                            console.error(
                                '[AFH PDF] Template download error:',
                                error
                            );

                            reject(
                                new Error(
                                    'Could not download the PDF template from GitHub.'
                                )
                            );
                        }
                });
            }
        );
    }

    // =========================================================================
    // BUILD COMBINED PDF
    // =========================================================================

    async function buildCombinedPdf(
        dogs,
        templateBytes
    ) {
        const {
            PDFDocument,
            StandardFonts,
            rgb
        } = PDFLib;

        const outputPdf =
            await PDFDocument.create();

        // Embed the first page of Leslie's template.
        const embeddedPages =
            await outputPdf.embedPdf(
                templateBytes,
                [0]
            );

        if (!embeddedPages.length) {
            throw new Error(
                'The template PDF did not contain a usable page.'
            );
        }

        const templatePage =
            embeddedPages[0];

        const pageWidth =
            templatePage.width;

        const pageHeight =
            templatePage.height;

        const nameFont =
            await outputPdf.embedFont(
                StandardFonts.TimesRomanBold
            );

        const bodyFont =
            await outputPdf.embedFont(
                StandardFonts.Helvetica
            );

        const white =
            rgb(1, 1, 1);

        const black =
            rgb(0, 0, 0);

        for (
            let index = 0;
            index < dogs.length;
            index++
        ) {
            const dog =
                dogs[index];

            setButtonState(
                `Building page ${index + 1} of ${dogs.length}...`,
                true
            );

            const page =
                outputPdf.addPage([
                    pageWidth,
                    pageHeight
                ]);

            // -----------------------------------------------------------------
            // DRAW TEMPLATE BACKGROUND
            // -----------------------------------------------------------------

            page.drawPage(
                templatePage,
                {
                    x: 0,
                    y: 0,
                    width:
                        pageWidth,
                    height:
                        pageHeight
                }
            );

            // -----------------------------------------------------------------
            // COVER THE SAMPLE'S CHANGEABLE CONTENT
            //
            // This preserves:
            // - paw prints
            // - AFH logo
            //
            // while removing:
            // - Roy's name
            // - Roy's breed
            // - Roy's sex
            // - Roy's DOB
            // - Roy's QR
            // -----------------------------------------------------------------

            // Name
            page.drawRectangle({
                x: 175,
                y: 477,
                width: 470,
                height: 95,
                color: white
            });

            // Breed
            page.drawRectangle({
                x: 150,
                y: 365,
                width: 490,
                height: 72,
                color: white
            });

            // Sex
            page.drawRectangle({
                x: 220,
                y: 310,
                width: 355,
                height: 62,
                color: white
            });

            // DOB
            page.drawRectangle({
                x: 185,
                y: 247,
                width: 425,
                height: 70,
                color: white
            });

            // Existing QR
            page.drawRectangle({
                x: 306,
                y: 161,
                width: 100,
                height: 98,
                color: white
            });

            // -----------------------------------------------------------------
            // DOG NAME
            // -----------------------------------------------------------------

            drawCenteredFittedText({
                page,
                text:
                    dog.name,

                font:
                    nameFont,

                preferredSize:
                    38,

                minimumSize:
                    22,

                maxWidth:
                    440,

                y:
                    506,

                color:
                    black
            });

            // -----------------------------------------------------------------
            // BREED
            // -----------------------------------------------------------------

            drawCenteredFittedText({
                page,
                text:
                    dog.breed,

                font:
                    bodyFont,

                preferredSize:
                    31,

                minimumSize:
                    17,

                maxWidth:
                    455,

                y:
                    389,

                color:
                    black
            });

            // -----------------------------------------------------------------
            // SEX
            // -----------------------------------------------------------------

            drawCenteredFittedText({
                page,
                text:
                    dog.sex,

                font:
                    bodyFont,

                preferredSize:
                    30,

                minimumSize:
                    20,

                maxWidth:
                    300,

                y:
                    335,

                color:
                    black
            });

            // -----------------------------------------------------------------
            // DOB
            // -----------------------------------------------------------------

            drawCenteredFittedText({
                page,
                text:
                    `born ${dog.dob}`,

                font:
                    bodyFont,

                preferredSize:
                    29,

                minimumSize:
                    19,

                maxWidth:
                    390,

                y:
                    270,

                color:
                    black
            });

            // -----------------------------------------------------------------
            // QR CODE
            // -----------------------------------------------------------------

            const qrPngBytes =
                createQrPng(
                    dog.url
                );

            const qrImage =
                await outputPdf.embedPng(
                    qrPngBytes
                );

            const qrSize = 78;

            // White quiet area behind QR.
            page.drawRectangle({
                x:
                    (pageWidth - 92) / 2,

                y:
                    166,

                width:
                    92,

                height:
                    92,

                color:
                    white
            });

            page.drawImage(
                qrImage,
                {
                    x:
                        (pageWidth - qrSize) / 2,

                    y:
                        173,

                    width:
                        qrSize,

                    height:
                        qrSize
                }
            );
        }

        return await outputPdf.save();
    }

    // =========================================================================
    // FIT + CENTER TEXT
    // =========================================================================

    function drawCenteredFittedText({
        page,
        text,
        font,
        preferredSize,
        minimumSize,
        maxWidth,
        y,
        color
    }) {
        let fontSize =
            preferredSize;

        while (
            fontSize > minimumSize &&
            font.widthOfTextAtSize(
                text,
                fontSize
            ) > maxWidth
        ) {
            fontSize -= 1;
        }

        const textWidth =
            font.widthOfTextAtSize(
                text,
                fontSize
            );

        page.drawText(
            text,
            {
                x:
                    (page.getWidth() - textWidth) / 2,

                y,

                size:
                    fontSize,

                font,

                color
            }
        );
    }

    // =========================================================================
    // QR CODE
    // =========================================================================

    function createQrPng(url) {
        // Error correction H = strong print reliability.
        const qr =
            qrcode(0, 'H');

        qr.addData(url);
        qr.make();

        const moduleCount =
            qr.getModuleCount();

        const moduleSize = 10;
        const quietZone = 4;

        const totalModules =
            moduleCount +
            (quietZone * 2);

        const canvas =
            document.createElement(
                'canvas'
            );

        canvas.width =
            totalModules *
            moduleSize;

        canvas.height =
            totalModules *
            moduleSize;

        const ctx =
            canvas.getContext(
                '2d'
            );

        // White background.
        ctx.fillStyle =
            '#ffffff';

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        // Black QR modules.
        ctx.fillStyle =
            '#000000';

        for (
            let row = 0;
            row < moduleCount;
            row++
        ) {
            for (
                let col = 0;
                col < moduleCount;
                col++
            ) {
                if (
                    qr.isDark(
                        row,
                        col
                    )
                ) {
                    ctx.fillRect(
                        (
                            col +
                            quietZone
                        ) *
                        moduleSize,

                        (
                            row +
                            quietZone
                        ) *
                        moduleSize,

                        moduleSize,
                        moduleSize
                    );
                }
            }
        }

        return dataUrlToUint8Array(
            canvas.toDataURL(
                'image/png'
            )
        );
    }

    // =========================================================================
    // PNG DATA URL -> BYTE ARRAY
    // =========================================================================

    function dataUrlToUint8Array(
        dataUrl
    ) {
        const base64 =
            dataUrl.split(',')[1];

        const binary =
            atob(base64);

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {
            bytes[i] =
                binary.charCodeAt(i);
        }

        return bytes;
    }

    // =========================================================================
    // NORMALIZE DOB
    //
    // Converts:
    // 06/26/2026 -> 6/26/2026
    // =========================================================================

    function normalizeDate(value) {
        const parts =
            value.split('/');

        if (parts.length !== 3) {
            return value;
        }

        const month =
            Number(parts[0]);

        const day =
            Number(parts[1]);

        const year =
            parts[2];

        return (
            `${month}/${day}/${year}`
        );
    }

    // =========================================================================
    // DOWNLOAD PDF
    // =========================================================================

    function downloadPdf(
        pdfBytes,
        filename
    ) {
        const blob =
            new Blob(
                [pdfBytes],
                {
                    type:
                        'application/pdf'
                }
            );

        const url =
            URL.createObjectURL(
                blob
            );

        const link =
            document.createElement(
                'a'
            );

        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body
            .appendChild(link);

        link.click();

        link.remove();

        setTimeout(
            () => {
                URL.revokeObjectURL(
                    url
                );
            },
            5000
        );
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function setButtonState(
        text,
        disabled
    ) {
        button.textContent =
            text;

        button.disabled =
            disabled;

        if (disabled) {
            button.style.opacity =
                '0.82';

            button.style.cursor =
                'wait';
        } else {
            button.style.opacity =
                '1';

            button.style.cursor =
                'pointer';

            button.style.background =
                '#17365d';
        }
    }

    function sleep(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    function getLocalDateString() {
        const now =
            new Date();

        const year =
            now.getFullYear();

        const month =
            String(
                now.getMonth() + 1
            ).padStart(
                2,
                '0'
            );

        const day =
            String(
                now.getDate()
            ).padStart(
                2,
                '0'
            );

        return (
            `${year}-${month}-${day}`
        );
    }

    // =========================================================================
    // STARTUP
    // =========================================================================

    console.log(
        `%cAFH Dog Sign PDF Generator v${SCRIPT_VERSION} loaded.`,
        'color:#17365d;font-weight:bold;font-size:14px;'
    );

})();
