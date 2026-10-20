import type { NextRequest } from "next/server";

/** SAML service provider metadata (stub: SSO is not connected, the file only shows the SP identifiers). */
export function GET(req: NextRequest) {
  const o = req.nextUrl.origin;
  const xml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${o}/api/auth/saml/metadata">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="false" WantAssertionsSigned="true">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${o}/api/auth/saml/acs" index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  return new Response(xml, { headers: { "Content-Type": "application/samlmetadata+xml" } });
}
