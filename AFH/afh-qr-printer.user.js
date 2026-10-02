// ==UserScript==
// @name         AFH - Available Dogs Sign PDF Generator
// @namespace    https://aforeverhome.org/
// @version      1.2.1
// @description  Create a printable PDF with one AFH dog sign per page, including a QR code to the dog's profile
// @author       Hunter Mihalick (PocketDr2026), Leslie Bloxam
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
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    const SCRIPT_VERSION = '1.2.1';

    const BASE_URL = 'https://aforeverhome.org';
    const GALLERY_URL = `${BASE_URL}/available-dogs/`;

    /*
     * Clean Leslie template stored in GitHub.
     *
     * Current GitHub filename:
     * leslie-template-clean (1).pdf
     */
    const TEMPLATE_URL =
        'https://raw.githubusercontent.com/' +
        'PocketDr2026/TamperMonkey-Scripts/' +
        'main/AFH/leslie-template-clean%20(1).pdf';

    const MAX_PAGES = 100;

    // Small delay so we do not hammer the AFH website.
    const REQUEST_DELAY_MS = 150;

    // =========================================================================
    // CREATE BUTTON
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
            setButtonState(
                'Finding available dogs...',
                true
            );

            if (typeof PDFLib === 'undefined') {
                throw new Error(
                    'The PDF library did not load. Refresh the page and try again.'
                );
            }

            if (typeof qrcode === 'undefined') {
                throw new Error(
                    'The QR code library did not load. Refresh the page and try again.'
                );
            }

            // -----------------------------------------------------------------
            // FIND ALL DOG IDS
            // -----------------------------------------------------------------

            const dogIds =
                await collectAllDogIds();

            if (!dogIds.length) {
                throw new Error(
                    'No available dogs were found on the AFH website.'
                );
            }

            console.log(
                `[AFH PDF] Found ${dogIds.length} available dogs.`
            );

            // -----------------------------------------------------------------
            // READ DOG PROFILES
            // -----------------------------------------------------------------

            const dogs = [];

            for (
                let i = 0;
                i < dogIds.length;
                i++
            ) {
                setButtonState(
                    `Reading dog ${i + 1} of ${dogIds.length}...`,
                    true
                );

                try {
                    const dog =
                        await getDogDetails(
                            dogIds[i]
                        );

                    if (dog) {
                        dogs.push(dog);
                    }

                } catch (error) {
                    console.error(
                        `[AFH PDF] Could not read dog ${dogIds[i]}:`,
                        error
                    );
                }

                await sleep(
                    REQUEST_DELAY_MS
                );
            }

            if (!dogs.length) {
                throw new Error(
                    'Dog listings were found, but their profile information could not be read.'
                );
            }

            // Alphabetical ordering.
            dogs.sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        undefined,
                        {
                            sensitivity: 'base'
                        }
                    )
            );

            // -----------------------------------------------------------------
            // DOWNLOAD CLEAN TEMPLATE
            // -----------------------------------------------------------------

            setButtonState(
                'Loading Leslie’s template...',
                true
            );

            const templateBytes =
                await loadTemplatePdf();

            // -----------------------------------------------------------------
            // BUILD PDF
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
            // DOWNLOAD FINISHED PDF
            // -----------------------------------------------------------------

            const today =
                getLocalDateString();

            downloadPdf(
                pdfBytes,
                `AFH-Dog-Signs-${today}.pdf`
            );

            setButtonState(
                `✓ Created ${dogs.length} dog signs!`,
                true
            );

            setTimeout(
                () => {
                    setButtonState(
                        '🐾 Create Dog Sign PDF',
                        false
                    );
                },
                4000
            );

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
    // FIND ALL AVAILABLE DOGS
    // =========================================================================

    async function collectAllDogIds() {
        const seenIds =
            new Set();

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
                new URL(
                    GALLERY_URL
                );

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
                    `Available Dogs page ${page} returned HTTP ${response.status}.`
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
                extractDogIds(
                    parsed
                );

            console.log(
                `[AFH PDF] Gallery page ${page}:`,
                pageIds
            );

            if (!pageIds.length) {
                break;
            }

            let newDogs = 0;

            for (
                const id of pageIds
            ) {
                if (
                    !seenIds.has(id)
                ) {
                    seenIds.add(id);
                    newDogs++;
                }
            }

            /*
             * AFH can return/repeat the final page when requesting
             * a page beyond the actual last page.
             */
            if (newDogs === 0) {
                break;
            }

            await sleep(
                REQUEST_DELAY_MS
            );
        }

        return Array.from(
            seenIds
        );
    }

    // =========================================================================
    // EXTRACT DOG IDS FROM AVAILABLE DOGS PAGE
    // =========================================================================

    function extractDogIds(doc) {
        const ids =
            new Set();

        const links =
            doc.querySelectorAll(
                'a[href]'
            );

        for (
            const link of links
        ) {
            const rawHref =
                link.getAttribute(
                    'href'
                );

            if (!rawHref) {
                continue;
            }

            if (
                !rawHref.includes(
                    'afh-single'
                )
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
                    url.searchParams.get(
                        'id'
                    );

                if (
                    id &&
                    /^\d+$/.test(id)
                ) {
                    ids.add(id);
                }

            } catch (error) {
                console.warn(
                    '[AFH PDF] Could not parse dog link:',
                    rawHref
                );
            }
        }

        return Array.from(
            ids
        );
    }

    // =========================================================================
    // READ DOG PROFILE
    // =========================================================================

    async function getDogDetails(id) {
        const profileUrl =
            `${BASE_URL}/afh-single-dog/?id=${encodeURIComponent(id)}`;

        console.log(
            `[AFH PDF] Reading dog ${id}: ${profileUrl}`
        );

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
                ?.replace(
                    /\s+/g,
                    ' '
                )
                ?.trim();

        if (!name) {
            name =
                `AFH Dog ${id}`;
        }

        // ---------------------------------------------------------------------
        // TURN PROFILE INTO CLEAN TEXT LINES
        // ---------------------------------------------------------------------

        const textLines =
            (
                parsed.body
                    ?.innerText ||
                ''
            )
                .split('\n')
                .map(
                    line =>
                        line
                            .replace(
                                /\s+/g,
                                ' '
                            )
                            .trim()
                )
                .filter(Boolean);

        let sex = '';
        let dob = '';
        let breed = '';

        let detailsLineIndex =
            -1;

        // ---------------------------------------------------------------------
        // SEX + DOB
        // ---------------------------------------------------------------------

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

                detailsLineIndex =
                    i;

                break;
            }
        }

        // ---------------------------------------------------------------------
        // BREED
        // ---------------------------------------------------------------------

        if (
            detailsLineIndex >= 0
        ) {
            for (
                let i =
                    detailsLineIndex + 1;

                i <
                textLines.length;

                i++
            ) {
                const candidate =
                    textLines[i];

                if (
                    !candidate ||
                    candidate === name
                ) {
                    continue;
                }

                if (
                    candidate.startsWith(
                        'Meet '
                    )
                ) {
                    continue;
                }

                if (
                    candidate.startsWith(
                        'Request Info'
                    )
                ) {
                    continue;
                }

                breed =
                    candidate;

                break;
            }
        }

        // ---------------------------------------------------------------------
        // FALLBACK SEX
        // ---------------------------------------------------------------------

        if (!sex) {
            const fullText =
                textLines.join(
                    '\n'
                );

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

        // ---------------------------------------------------------------------
        // FALLBACK DOB
        // ---------------------------------------------------------------------

        if (!dob) {
            const fullText =
                textLines.join(
                    '\n'
                );

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

        // ---------------------------------------------------------------------
        // FALLBACK BREED
        // ---------------------------------------------------------------------

        if (!breed) {
            breed =
                'Breed information unavailable';
        }

        const dog = {
            id,
            name,
            breed,
            sex:
                sex ||
                'sex unavailable',

            dob:
                dob ||
                'date unavailable',

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
    // DOWNLOAD CLEAN LESLIE TEMPLATE
    // =========================================================================

    function loadTemplatePdf() {
        return new Promise(
            (
                resolve,
                reject
            ) => {

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
                                    'Could not download Leslie’s PDF template from GitHub. ' +
                                    `HTTP ${response.status}`
                                )
                            );
                        },

                    onerror:
                        error => {

                            console.error(
                                '[AFH PDF] Template download failed:',
                                error
                            );

                            reject(
                                new Error(
                                    'Could not download Leslie’s PDF template from GitHub.'
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

        // ---------------------------------------------------------------------
        // LOAD CLEAN BACKGROUND
        // ---------------------------------------------------------------------

        const embeddedPages =
            await outputPdf.embedPdf(
                templateBytes,
                [0]
            );

        if (
            !embeddedPages.length
        ) {
            throw new Error(
                'Leslie’s template does not contain a usable page.'
            );
        }

        const templatePage =
            embeddedPages[0];

        const pageWidth =
            templatePage.width;

        const pageHeight =
            templatePage.height;

        // ---------------------------------------------------------------------
        // FONTS
        //
        // Leslie's original design uses a bold serif-style name and a clean
        // sans-serif body font. These standard PDF fonts approximate that
        // style without requiring outside font files.
        // ---------------------------------------------------------------------

        const nameFont =
            await outputPdf.embedFont(
                StandardFonts.TimesRomanBold
            );

        const bodyFont =
            await outputPdf.embedFont(
                StandardFonts.Helvetica
            );

        const black =
            rgb(
                0,
                0,
                0
            );

        const white =
            rgb(
                1,
                1,
                1
            );

        // ---------------------------------------------------------------------
        // CREATE ONE PAGE PER DOG
        // ---------------------------------------------------------------------

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

            // Leslie's clean background.
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
            // DOG / LITTER NAME
            //
            // Original Leslie template position.
            // -----------------------------------------------------------------

            drawCenteredFittedText({
                page,
                text:
                    dog.name,

                font:
                    nameFont,

                preferredSize:
                    72,

                minimumSize:
                    30,

                maxWidth:
                    520,

                y:
                    467,

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
                    36,

                minimumSize:
                    21,

                maxWidth:
                    500,

                y:
                    353,

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
                    36,

                minimumSize:
                    24,

                maxWidth:
                    300,

                y:
                    289,

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
                    36,

                minimumSize:
                    22,

                maxWidth:
                    430,

                y:
                    216,

                color:
                    black
            });

            // -----------------------------------------------------------------
            // QR CODE
            //
            // Placed in the open lower-middle section above the AFH logo.
            // -----------------------------------------------------------------

            const qrPngBytes =
                createQrPng(
                    dog.url
                );

            const qrImage =
                await outputPdf.embedPng(
                    qrPngBytes
                );

            const qrSize =
                82;

            const qrX =
                (
                    pageWidth -
                    qrSize
                ) / 2;

            const qrY =
                105;

            // Slightly larger white square behind it maintains the required
            // QR quiet zone and keeps the code very easy for phones to scan.
            page.drawRectangle({
                x:
                    qrX - 7,

                y:
                    qrY - 7,

                width:
                    qrSize + 14,

                height:
                    qrSize + 14,

                color:
                    white
            });

            page.drawImage(
                qrImage,
                {
                    x:
                        qrX,

                    y:
                        qrY,

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
    // DRAW CENTERED TEXT THAT SHRINKS WHEN NECESSARY
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
            fontSize >
                minimumSize &&
            font.widthOfTextAtSize(
                text,
                fontSize
            ) >
                maxWidth
        ) {
            fontSize -= 1;
        }

        const textWidth =
            font.widthOfTextAtSize(
                text,
                fontSize
            );

        const x =
            (
                page.getWidth() -
                textWidth
            ) / 2;

        page.drawText(
            text,
            {
                x,
                y,
                size:
                    fontSize,
                font,
                color
            }
        );
    }

    // =========================================================================
    // CREATE QR CODE
    // =========================================================================

    function createQrPng(
        url
    ) {
        /*
         * Error correction level H gives us excellent print/scanning
         * reliability.
         */
        const qr =
            qrcode(
                0,
                'H'
            );

        qr.addData(
            url
        );

        qr.make();

        const moduleCount =
            qr.getModuleCount();

        const moduleSize =
            10;

        const quietZone =
            4;

        const totalModules =
            moduleCount +
            (
                quietZone *
                2
            );

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
    // DATA URL -> UINT8ARRAY
    // =========================================================================

    function dataUrlToUint8Array(
        dataUrl
    ) {
        const base64 =
            dataUrl.split(
                ','
            )[1];

        const binary =
            atob(
                base64
            );

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
                binary.charCodeAt(
                    i
                );
        }

        return bytes;
    }

    // =========================================================================
    // NORMALIZE DATE
    //
    // 06/26/2026 -> 6/26/2026
    // =========================================================================

    function normalizeDate(
        value
    ) {
        const parts =
            value.split(
                '/'
            );

        if (
            parts.length !== 3
        ) {
            return value;
        }

        const month =
            Number(
                parts[0]
            );

        const day =
            Number(
                parts[1]
            );

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

        link.href =
            url;

        link.download =
            filename;

        link.style.display =
            'none';

        document.body
            .appendChild(
                link
            );

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
    // BUTTON STATE
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

    // =========================================================================
    // HELPERS
    // =========================================================================

    function sleep(
        milliseconds
    ) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    milliseconds
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
