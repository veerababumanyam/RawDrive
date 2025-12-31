"""PDF Generator Utility for RSVP Export.

Generates PDF reports from RSVP data using reportlab.

Feature: 016-save-the-date
Task: T058
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import List, Optional, Any

logger = logging.getLogger(__name__)

# Optional reportlab import - graceful degradation if not available
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import (
        SimpleDocTemplate,
        Table,
        TableStyle,
        Paragraph,
        Spacer,
        PageBreak,
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("reportlab not installed - PDF generation will be unavailable")


class PDFGenerationError(Exception):
    """Error during PDF generation."""

    pass


class RSVPPDFGenerator:
    """Generates PDF reports for RSVP data."""

    def __init__(
        self,
        title: str = "RSVP Report",
        pagesize: tuple = A4 if REPORTLAB_AVAILABLE else (595, 842),
    ):
        self.title = title
        self.pagesize = pagesize
        self._check_available()

    def _check_available(self) -> None:
        """Check if reportlab is available."""
        if not REPORTLAB_AVAILABLE:
            raise PDFGenerationError(
                "PDF generation is not available. Install reportlab: pip install reportlab"
            )

    def generate(
        self,
        rsvps: List[dict[str, Any]],
        stats: Optional[dict[str, Any]] = None,
        invitation_title: Optional[str] = None,
        event_datetime: Optional[datetime] = None,
    ) -> bytes:
        """Generate PDF from RSVP data.

        Args:
            rsvps: List of RSVP dictionaries
            stats: Optional statistics summary
            invitation_title: Title of the invitation
            event_datetime: Event date/time

        Returns:
            PDF as bytes
        """
        self._check_available()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.pagesize,
            rightMargin=0.5 * inch,
            leftMargin=0.5 * inch,
            topMargin=0.5 * inch,
            bottomMargin=0.5 * inch,
        )

        # Build document elements
        elements = []
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Heading1"],
            fontSize=18,
            spaceAfter=12,
            alignment=TA_CENTER,
        )

        subtitle_style = ParagraphStyle(
            "CustomSubtitle",
            parent=styles["Normal"],
            fontSize=12,
            textColor=colors.grey,
            spaceAfter=20,
            alignment=TA_CENTER,
        )

        heading_style = ParagraphStyle(
            "CustomHeading",
            parent=styles["Heading2"],
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10,
        )

        # Title
        title_text = invitation_title or self.title
        elements.append(Paragraph(title_text, title_style))

        # Subtitle with event date
        if event_datetime:
            date_str = event_datetime.strftime("%B %d, %Y at %I:%M %p")
            elements.append(Paragraph(f"Event Date: {date_str}", subtitle_style))
        else:
            elements.append(
                Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')}", subtitle_style)
            )

        # Statistics Summary
        if stats:
            elements.append(Paragraph("Summary", heading_style))
            stats_data = [
                ["Metric", "Count"],
                ["Total RSVPs", str(stats.get("total", 0))],
                ["Attending", str(stats.get("attending", 0))],
                ["Not Attending", str(stats.get("not_attending", 0))],
                ["Maybe", str(stats.get("maybe", 0))],
                ["Total Party Size", str(stats.get("total_party_size", 0))],
            ]

            stats_table = Table(stats_data, colWidths=[2.5 * inch, 1.5 * inch])
            stats_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 11),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                        ("TOPPADDING", (0, 0), (-1, 0), 10),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 1), (-1, -1), 10),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                        ("TOPPADDING", (0, 1), (-1, -1), 6),
                    ]
                )
            )
            elements.append(stats_table)
            elements.append(Spacer(1, 20))

        # RSVP List
        if rsvps:
            elements.append(Paragraph("Guest List", heading_style))

            # Table header
            table_data = [
                ["Name", "Email", "Status", "Party Size", "Dietary", "RSVP Date"]
            ]

            # Table rows
            for rsvp in rsvps:
                status = "Attending" if rsvp.get("attending") is True else (
                    "Not Attending" if rsvp.get("attending") is False else "Maybe"
                )
                created_at = rsvp.get("created_at", "")
                if created_at:
                    if isinstance(created_at, str):
                        try:
                            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                            created_at = dt.strftime("%m/%d/%Y")
                        except Exception:
                            pass
                    elif isinstance(created_at, datetime):
                        created_at = created_at.strftime("%m/%d/%Y")

                table_data.append(
                    [
                        self._truncate(rsvp.get("guest_name", ""), 20),
                        self._truncate(rsvp.get("guest_email", ""), 25),
                        status,
                        str(rsvp.get("party_size", 1)),
                        self._truncate(rsvp.get("dietary_preferences", "") or "-", 15),
                        created_at,
                    ]
                )

            # Create table with dynamic column widths
            col_widths = [1.3 * inch, 1.8 * inch, 0.8 * inch, 0.6 * inch, 1.0 * inch, 0.8 * inch]
            rsvp_table = Table(table_data, colWidths=col_widths, repeatRows=1)

            rsvp_table.setStyle(
                TableStyle(
                    [
                        # Header
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 9),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                        ("TOPPADDING", (0, 0), (-1, 0), 8),
                        # Body
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 1), (-1, -1), 8),
                        ("ALIGN", (0, 1), (-1, -1), "LEFT"),
                        ("ALIGN", (2, 1), (3, -1), "CENTER"),  # Status and party size centered
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        # Alternating row colors
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                        # Grid
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
                        ("TOPPADDING", (0, 1), (-1, -1), 5),
                    ]
                )
            )
            elements.append(rsvp_table)
        else:
            elements.append(
                Paragraph(
                    "No RSVPs have been submitted yet.",
                    ParagraphStyle("NoData", parent=styles["Normal"], textColor=colors.grey),
                )
            )

        # Footer
        elements.append(Spacer(1, 30))
        footer_style = ParagraphStyle(
            "Footer",
            parent=styles["Normal"],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
        )
        elements.append(
            Paragraph(
                f"Generated by RawDrive on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}",
                footer_style,
            )
        )

        # Build PDF
        doc.build(elements)

        # Get PDF bytes
        buffer.seek(0)
        return buffer.getvalue()

    def _truncate(self, text: str, max_length: int) -> str:
        """Truncate text to max length with ellipsis."""
        if len(text) <= max_length:
            return text
        return text[: max_length - 3] + "..."


def generate_rsvp_pdf(
    rsvps: List[dict[str, Any]],
    stats: Optional[dict[str, Any]] = None,
    invitation_title: Optional[str] = None,
    event_datetime: Optional[datetime] = None,
) -> bytes:
    """Convenience function to generate RSVP PDF.

    Args:
        rsvps: List of RSVP dictionaries
        stats: Optional statistics summary
        invitation_title: Title of the invitation
        event_datetime: Event date/time

    Returns:
        PDF as bytes

    Raises:
        PDFGenerationError: If PDF generation fails or reportlab is unavailable
    """
    generator = RSVPPDFGenerator(title=invitation_title or "RSVP Report")
    return generator.generate(
        rsvps=rsvps,
        stats=stats,
        invitation_title=invitation_title,
        event_datetime=event_datetime,
    )


def is_pdf_available() -> bool:
    """Check if PDF generation is available."""
    return REPORTLAB_AVAILABLE
