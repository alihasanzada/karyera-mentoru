from app.services.pdf_parser import _clean


def test_page_marker_removed():
    assert _clean("Salam\nSəhifə 1 / 1\n2020 - 2023") == "Salam\n2020 - 2023"